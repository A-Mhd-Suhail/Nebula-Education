import mqtt, { type MqttClient } from "mqtt";
import { recomputeAirScore } from "./airscore";
import { audit } from "./auditlog";
import { todayStr } from "./helpers";
import { notifyRoles } from "./notify";
import { dbAdd, dbGet, dbList, dbSet, dbUpdate } from "./store";
import type {
  Attendance, DeviceTag, HardwareDevice, Incident, PresenceLog,
  QuizQuestion, SyllabusTopic, SystemSettings, UserProfile,
} from "./types";

export const DEFAULT_SETTINGS: SystemSettings = {
  distanceThreshold: 5, entryGraceMin: 5, exitGraceMin: 5,
  noiseWarningDb: 70, noiseAlarmDb: 80, noiseDurationSec: 5,
  schoolStart: "09:15", schoolEnd: "16:00",
  engagementMinutes: 2, quizQuestions: 3, coverageThreshold: 85,
  heartbeatTimeoutSec: 90,
  airWeights: { attendance: 25, learning: 25, quiz: 20, assignments: 15, participation: 15 },
  mqttBroker: "wss://broker.emqx.io:8084/mqtt",
  mqttTopicIn: "nebula/classroom/events",
  mqttTopicOut: "nebula/classroom/commands",
};

let client: MqttClient | null = null;
let settings: SystemSettings = { ...DEFAULT_SETTINGS };
let tags: DeviceTag[] = [];
const seen = new Set<string>();
let offlineTimer: number | undefined;

export type HwStatus = { connected: boolean; broker: string; topicIn: string; error?: string };
let statusCb: ((s: HwStatus) => void) | null = null;

export function onHardwareStatus(cb: (s: HwStatus) => void): void { statusCb = cb; emit(); }
function emit(error?: string): void {
  statusCb?.({ connected: client?.connected ?? false, broker: settings.mqttBroker, topicIn: settings.mqttTopicIn, error });
}

export async function loadSettings(): Promise<SystemSettings> {
  const s = await dbGet<SystemSettings>("settings", "hardware");
  settings = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
  if (!settings.airWeights) settings.airWeights = { ...DEFAULT_SETTINGS.airWeights };
  return settings;
}
export function getSettings(): SystemSettings { return settings; }
export async function refreshTags(): Promise<void> { tags = await dbList<DeviceTag>("devices"); }
export function isConnected(): boolean { return client?.connected ?? false; }

export async function connectHardware(): Promise<void> {
  if (client?.connected) return;
  await loadSettings();
  await refreshTags();
  client = mqtt.connect(settings.mqttBroker, {
    clientId: "nebula-" + Math.random().toString(16).slice(2, 10), clean: true, connectTimeout: 8000,
  });
  client.on("connect", () => { client?.subscribe(settings.mqttTopicIn); emit(); });
  client.on("message", (_t, p) => { void handleRaw(p.toString()); });
  client.on("error", (e) => emit(e.message));
  client.on("close", () => emit());
  startOfflineWatcher();
}

export function disconnectHardware(): void {
  if (client) { client.end(true); client = null; }
  emit();
}

export function publishCommand(obj: object): void {
  if (client?.connected) client.publish(settings.mqttTopicOut, JSON.stringify(obj));
}

/* ============ Website → Hardware commands ============ */
export function cmdTestBuzzer(room: string): void { publishCommand({ command: "TEST_BUZZER", room }); }
export function cmdRestartCamera(room: string, cameraId: string): void { publishCommand({ command: "RESTART_CAMERA", room, cameraId }); }
export function cmdCaptureBoard(room: string): void { publishCommand({ command: "CAPTURE_BOARD", room }); }
export function cmdPushThresholds(): void {
  publishCommand({
    command: "CHANGE_THRESHOLDS",
    noiseWarningDb: settings.noiseWarningDb, noiseAlarmDb: settings.noiseAlarmDb,
    distanceThreshold: settings.distanceThreshold,
  });
}

async function handleRaw(text: string): Promise<void> {
  try { await processEvent(JSON.parse(text) as Record<string, unknown>); }
  catch { console.warn("Bad MQTT payload:", text); }
}

/* ============ Universal event pipeline ============ */

export async function processEvent(evt: Record<string, unknown>): Promise<void> {
  const key = [evt.event, evt.ts ?? evt.timestamp, evt.tag_id ?? evt.student_id ?? evt.device_id ?? evt.room].join("|");
  if (seen.has(key)) return;
  seen.add(key);
  if (seen.size > 1000) seen.clear();

  await loadSettings();
  await refreshTags();
  const type = String(evt.event ?? "");
  const room = String(evt.room ?? "");

  void dbAdd("classroomEvents", {
    eventId: key, type, room, timestamp: Date.now(),
    confidence: (evt.confidence as number) ?? null,
    severity: severityFor(type),
    meta: JSON.stringify(evt).slice(0, 900),
  });

  switch (type) {
    case "ATTENDANCE": return handleAttendance(evt);
    case "HEARTBEAT": return handleHeartbeat(evt);
    case "NOISE_ALARM": return handleNoise(evt);
    case "FIGHT": return handleFight(evt);
    case "INATTENTION": return handleInattention(evt);
    case "SPEECH": return handleSpeech(evt);
    case "BOARD_CAPTURE": return handleBoard(evt);
    case "STUDENT_LEFT": return handleLeft(evt);
    case "STUDENT_RETURNED": return handleReturned(evt);
    case "TEACHER_ACTIVITY": return handleTeacherActivity(evt);
    case "ENGAGEMENT": return handleEngagement(evt);
    default: console.warn("Unknown hardware event:", type);
  }
}

function severityFor(t: string): "low" | "medium" | "high" | "critical" {
  if (t === "FIGHT") return "critical";
  if (t === "NOISE_ALARM" || t === "TEACHER_ACTIVITY" || t === "STUDENT_LEFT") return "high";
  if (t === "INATTENTION") return "medium";
  return "low";
}

async function alert(category: string, priority: "low" | "medium" | "high" | "critical",
                     message: string, room = "", refId = ""): Promise<void> {
  await dbAdd("alerts", { category, priority, message, room, refId, status: "open", notes: [], createdAt: Date.now() });
  if (priority === "critical") await notifyRoles(["hm"], "🚨 " + category.toUpperCase(), message, "critical");
}

/* ============ Handlers ============ */

async function handleAttendance(evt: Record<string, unknown>): Promise<void> {
  const tagId = String(evt.tag_id ?? evt.student_id ?? "");
  const room = String(evt.room ?? "");
  const dev = tags.find((d) => d.tagId === tagId);
  if (!dev) { await alert("attendance", "medium", `❓ Unknown tag "${tagId}" tried to mark attendance`, room); return; }
  const dist = Number(evt.distance ?? 0);
  if (dist > settings.distanceThreshold) {
    await alert("attendance", "medium", `📏 ${dev.name} too far (${dist}m > ${settings.distanceThreshold}m limit) — NOT marked present`, room);
    return;
  }
  const date = todayStr();
  const todays = await dbList<Attendance>("attendance", { where: [["date", "==", date]] });
  if (todays.some((a) => a.uid === dev.uid)) return;
  await dbAdd("attendance", {
    date, uid: dev.uid, name: dev.name, role: dev.role,
    status: "present", method: "hardware-mqtt", createdAt: Date.now(),
  });
  await alert("attendance", "low", `✅ ${dev.name} marked present (tag ${tagId}, ${dist}m)`, room);
  void recomputeAirScore(dev.uid, "hardware attendance");
}

async function handleHeartbeat(evt: Record<string, unknown>): Promise<void> {
  const deviceId = String(evt.device_id ?? "");
  if (!deviceId) return;
  const rows = await dbList<HardwareDevice>("hardware", { where: [["deviceId", "==", deviceId]] });
  const data = {
    deviceId, type: String(evt.type ?? "pi") as HardwareDevice["type"],
    room: String(evt.room ?? ""), status: "online" as const, lastSeen: Date.now(),
    fw: String(evt.fw ?? ""), cpuTemp: Number(evt.cpuTemp ?? 0), cpuUsage: Number(evt.cpuUsage ?? 0),
    ram: Number(evt.ram ?? 0), network: String(evt.network ?? ""),
  };
  if (rows[0]) await dbSet("hardware", rows[0].id, data);
  else await dbAdd("hardware", data);
}

async function handleNoise(evt: Record<string, unknown>): Promise<void> {
  const room = String(evt.room ?? "");
  const level = Number(evt.level ?? 0);
  await dbAdd("noiseEvents", { room, level, threshold: settings.noiseAlarmDb, createdAt: Date.now() });
  if (level >= settings.noiseAlarmDb) {
    publishCommand({ command: "TRIGGER_BUZZER", room, seconds: settings.noiseDurationSec });
    await alert("noise", "critical", `🔊 HIGH NOISE ${level}dB in ${room} (alarm ${settings.noiseAlarmDb}dB) — buzzer triggered`, room);
  } else if (level >= settings.noiseWarningDb) {
    await alert("noise", "medium", `🔊 Noise warning ${level}dB in ${room} (warn ${settings.noiseWarningDb}dB)`, room);
  }
}

async function handleFight(evt: Record<string, unknown>): Promise<void> {
  const room = String(evt.room ?? "");
  const rawTags = Array.isArray(evt.involved_tags) ? (evt.involved_tags as unknown[]).map(String) : [];
  const involved = rawTags.map((t) => tags.find((d) => d.tagId === t)).filter((d): d is DeviceTag => Boolean(d));
  const names = involved.map((d) => d.name);
  const confidence = Number(evt.confidence ?? 0.9);
  await dbAdd("incidents", {
    type: "fight", room, involvedIds: involved.map((d) => d.uid), involvedNames: names,
    confidence, priority: "critical",
    description: `Possible physical incident detected (AI confidence ${(confidence * 100).toFixed(0)}%) — requires review`,
    status: "open", source: "hardware", cameraId: String(evt.camera_id ?? "cam-students"),
    createdAt: Date.now(),
  } as Incident);
  for (const d of involved) {
    const u = await dbGet<UserProfile>("users", d.uid);
    if (u) {
      await dbSet("users", d.uid, { behaviorScore: Math.max(0, (u.behaviorScore ?? 100) - 15) });
      void recomputeAirScore(d.uid, "incident review");
    }
  }
  await alert("fight", "critical", `🥊 Possible FIGHT in ${room} involving ${names.join(", ") || rawTags.join(", ") || "unknown tags"} — human review required`, room);
  publishCommand({ command: "ALARM", room });
  await audit("incident_auto_created", "fight in " + room);
}

async function handleInattention(evt: Record<string, unknown>): Promise<void> {
  const tag = String(evt.student_id ?? evt.tag_id ?? "");
  const room = String(evt.room ?? "");
  const dev = tags.find((d) => d.tagId === tag);
  if (!dev) { await alert("engagement", "medium", `❓ Disengagement flag for unknown tag "${tag}"`, room); return; }
  const topic = String(evt.topic ?? "Current lesson");
  const subject = String(evt.subject ?? dev.room ?? "General");
  const questions = generateQuiz(topic, subject).slice(0, settings.quizQuestions);
  await dbAdd("quizRequests", {
    studentUid: dev.uid, studentName: dev.name, topic, subject, questions,
    status: "pending", createdBy: "hardware", createdAt: Date.now(),
  });
  await alert("engagement", "medium", `📵 ${dev.name}: possible prolonged disengagement (${settings.engagementMinutes}+ min) — quiz on "${topic}" awaiting teacher approval`, room);
}

async function handleSpeech(evt: Record<string, unknown>): Promise<void> {
  const text = String(evt.text ?? "");
  const room = String(evt.room ?? "");
  const todays = await dbList<SyllabusTopic>("syllabus", { where: [["date", "==", todayStr()]] });
  const words: string[] = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  let best: { t: SyllabusTopic; score: number } | null = null;
  for (const t of todays) {
    const tw: string[] = String(t.topic).toLowerCase().match(/[a-z0-9]+/g) ?? [];
    let score = 0;
    for (const w of tw) if (w.length > 3 && words.includes(w)) score++;
    if (score > 0 && (!best || score > best.score)) best = { t, score };
  }
  if (best) {
    await dbUpdate("syllabus", best.t.id, { doneByAI: true });
    await dbAdd("speechLogs", { room, text, matchedTopic: best.t.topic, status: "on_track", createdAt: Date.now() });
    await alert("syllabus", "low", `✅ Syllabus engine: "${best.t.topic}" confirmed being taught in ${room}`, room);
  } else {
    await dbAdd("speechLogs", { room, text, matchedTopic: "", status: "off_track", createdAt: Date.now() });
    await alert("syllabus", "medium", `📚 Speech in ${room} does not match today's syllabus plan — possible gap`, room);
  }
}

async function handleBoard(evt: Record<string, unknown>): Promise<void> {
  const room = String(evt.room ?? "");
  const image = String(evt.image ?? "");
  if (!image) return;
  await dbAdd("boardImages", { room, cameraId: String(evt.camera_id ?? "cam-board"), image, capturedAt: Date.now() });
  await alert("board", "low", `📸 Board snapshot captured in ${room} — pushed to student tabs`, room);
}

async function handleLeft(evt: Record<string, unknown>): Promise<void> {
  const tag = String(evt.tag_id ?? "");
  const room = String(evt.room ?? "");
  const dev = tags.find((d) => d.tagId === tag);
  if (!dev) return;
  const date = todayStr();
  const rows = await dbList<PresenceLog>("presence", { where: [["uid", "==", dev.uid]] });
  if (rows.some((p) => p.open && p.date === date)) return;
  await dbAdd("presence", { uid: dev.uid, name: dev.name, date, leftAt: Date.now(), open: true });
  await alert("attendance", "high", `🚪 ${dev.name} LEFT the classroom (${room})`, room);
}

async function handleReturned(evt: Record<string, unknown>): Promise<void> {
  const tag = String(evt.tag_id ?? "");
  const room = String(evt.room ?? "");
  const dev = tags.find((d) => d.tagId === tag);
  if (!dev) return;
  const date = todayStr();
  const rows = await dbList<PresenceLog>("presence", { where: [["uid", "==", dev.uid]] });
  const p = rows.find((x) => x.open && x.date === date);
  if (p) {
    const mins = Math.max(1, Math.round((Date.now() - p.leftAt) / 60000));
    await dbUpdate("presence", p.id, { open: false, returnedAt: Date.now(), minutesOut: mins });
    await alert("attendance", "low", `↩️ ${dev.name} returned to ${room} after ${mins} min outside`, room);
  }
}

/* Careful wording: AI detections are flags for human review, never automatic punishment. */
async function handleTeacherActivity(evt: Record<string, unknown>): Promise<void> {
  const room = String(evt.room ?? "");
  const kind = String(evt.activity ?? "unusual");
  const wording: Record<string, string> = {
    phone: "Possible phone-use event detected — requires review.",
    left: "Possible teacher left classroom — requires review.",
    inactive: "Possible prolonged teacher inactivity — requires review.",
    unusual: "Possible unusual teacher activity — requires review.",
  };
  const tTag = String(evt.teacher_tag ?? "");
  const tname = String(evt.teacher_name ?? tags.find((d) => d.tagId === tTag)?.name ?? "Teacher");
  const msg = wording[kind] ?? wording["unusual"]!;
  await dbAdd("incidents", {
    type: "teacher_violation", room, involvedIds: [], involvedNames: [tname],
    confidence: Number(evt.confidence ?? 0.8), priority: "high",
    description: msg, status: "open", source: "hardware",
    cameraId: String(evt.camera_id ?? "cam-teacher"), createdAt: Date.now(),
  });
  await alert("teacher_activity", "high", `⚠️ ${tname} (${room}): ${msg}`, room);
}

async function handleEngagement(evt: Record<string, unknown>): Promise<void> {
  const room = String(evt.room ?? "");
  const level = Number(evt.level ?? 0);
  if (level < 40) await alert("engagement", "low", `🧠 Low class engagement (${level}%) in ${room}`, room);
}

/* ============ Hardware health: offline detection ============ */

function startOfflineWatcher(): void {
  if (offlineTimer) return;
  offlineTimer = window.setInterval(() => {
    void (async () => {
      try {
        const s = await loadSettings();
        const rows = await dbList<HardwareDevice>("hardware", { where: [["status", "==", "online"]] });
        const now = Date.now();
        for (const d of rows) {
          if (now - (d.lastSeen ?? 0) > s.heartbeatTimeoutSec * 1000) {
            await dbSet("hardware", d.id, { status: "offline" });
            await alert("hardware", "critical", `🔧 ${d.type.toUpperCase()} ${d.deviceId} OFFLINE (${d.room}) — last seen ${d.lastSeen ? new Date(d.lastSeen).toLocaleTimeString() : "never"}`, d.room);
            await notifyRoles(["hm"], "🔧 Hardware offline", `${d.deviceId} in ${d.room} stopped responding`, "critical");
          }
        }
      } catch { /* signed out or offline — ignore */ }
    })();
  }, 30000);
}

/* ============ Punctuality ============ */

export async function checkTeacherLate(uid: string, name: string): Promise<void> {
  const now = new Date();
  const [h, m] = settings.schoolStart.split(":").map(Number);
  const limit = new Date();
  limit.setHours(h || 9, m || 15, 0, 0);
  if (now > limit) {
    await dbAdd("incidents", {
      type: "teacher_violation", room: "", involvedIds: [uid], involvedNames: [name],
      priority: "medium",
      description: `Teacher started class at ${now.toLocaleTimeString()} — after scheduled start ${settings.schoolStart}`,
      status: "open", source: "system", createdAt: Date.now(),
  });
    await alert("punctuality", "medium", `⏰ ${name} started class late (after ${settings.schoolStart})`);
  }
}

/* ============ AI Quiz Generator ============ */
/* Rule-based (offline, free). To use an LLM: call the OpenAI API here with
   `Write ${n} multiple-choice questions about "${topic}" for a ${subject} class,
   JSON: [{question, options[4], correctIndex}]` and map into QuizQuestion[]. */

function mk(question: string, correct: string, wrong: string[]): QuizQuestion {
  const opts = [correct, ...wrong];
  const ci = Math.floor(Math.random() * opts.length);
  const c = opts.splice(opts.indexOf(correct), 1)[0]!;
  opts.splice(ci, 0, c);
  return { question, options: opts, correctIndex: ci };
}

export function generateQuiz(topic: string, subject: string): QuizQuestion[] {
  const t = topic.trim();
  return [
    mk(`Which best describes "${t}"?`, `The core idea of ${t}`, ["An unrelated formula", "A classroom rule", "A school event"]),
    mk(`In ${subject}, why does "${t}" matter?`, `It explains how and why things behave in ${subject}`, ["It is never used", "Only for homework", "It is outdated"]),
    mk(`Which situation connects to "${t}"?`, `${t} applied to a real example`, ["Something with no relation", "A different subject entirely", "Random noise"]),
  ];
}

/* ============ Simulator (demo without a Pi) ============ */

async function send(evt: Record<string, unknown>): Promise<void> {
  if (client?.connected) client.publish(settings.mqttTopicIn, JSON.stringify(evt));
  else await processEvent(evt);
}

function roomOf(tagId: string): string { return tags.find((d) => d.tagId === tagId)?.room ?? ""; }

export async function simulateAttendance(tagId: string): Promise<void> {
  await send({ event: "ATTENDANCE", tag_id: tagId, distance: 2.5, room: roomOf(tagId), ts: Date.now() });
}
export async function simulateFight(room: string, tagsIds: string[]): Promise<void> {
  await send({ event: "FIGHT", room, involved_tags: tagsIds, confidence: 0.93, ts: Date.now() });
}
export async function simulateNoise(room: string): Promise<void> {
  await send({ event: "NOISE_ALARM", room, level: settings.noiseAlarmDb + 5, ts: Date.now() });
}
export async function simulateInattention(tagId: string, topic: string): Promise<void> {
  await send({ event: "INATTENTION", student_id: tagId, topic, room: roomOf(tagId), ts: Date.now() });
}
export async function simulateSpeech(room: string, text: string): Promise<void> {
  await send({ event: "SPEECH", room, text, ts: Date.now() });
}
export async function simulateBoard(room: string, topic: string): Promise<void> {
  const svg = `<svg xmlns='http://www.w3.org/2000/svg' width='480' height='280'><rect width='100%' height='100%' fill='#1f2937'/><text x='24' y='60' fill='#ffffff' font-size='24'>Board — ${room}</text><text x='24' y='120' fill='#93c5fd' font-size='20'>${topic}</text><text x='24' y='170' fill='#fbbf24' font-size='18'>a² + b² = c²</text><text x='24' y='220' fill='#a7f3d0' font-size='16'>captured ${new Date().toLocaleTimeString()}</text></svg>`;
  const image = "data:image/svg+xml;utf8," + encodeURIComponent(svg);
  await send({ event: "BOARD_CAPTURE", room, camera_id: "cam-board-03", image, ts: Date.now() });
}
export async function simulateStudentLeft(tagId: string): Promise<void> {
  await send({ event: "STUDENT_LEFT", tag_id: tagId, room: roomOf(tagId), ts: Date.now() });
}
export async function simulateStudentReturned(tagId: string): Promise<void> {
  await send({ event: "STUDENT_RETURNED", tag_id: tagId, room: roomOf(tagId), ts: Date.now() });
}
export async function simulateTeacherActivity(room: string, kind: string, teacherName: string): Promise<void> {
  await send({ event: "TEACHER_ACTIVITY", room, activity: kind, teacher_name: teacherName, confidence: 0.82, camera_id: "cam-teacher-01", ts: Date.now() });
}
export async function simulateEngagement(room: string, level: number): Promise<void> {
  await send({ event: "ENGAGEMENT", room, level, ts: Date.now() });
}
export async function simulateHeartbeat(deviceId: string, type: string, room: string): Promise<void> {
  await send({
    event: "HEARTBEAT", device_id: deviceId, type, room,
    cpuTemp: 45 + Math.floor(Math.random() * 15), cpuUsage: 20 + Math.floor(Math.random() * 40),
    ram: 30 + Math.floor(Math.random() * 30), fw: "v3.0.1", network: "wifi -55dBm", ts: Date.now(),
  });
}
