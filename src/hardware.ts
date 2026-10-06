import mqtt, { type MqttClient } from "mqtt";
import { recomputeAirScore } from "./airscore";
import { audit } from "./auditlog";
import { todayStr } from "./helpers";
import { notifyRoles } from "./notify";
import { generateQuiz } from "./quiz";
import { state } from "./state";
import { dbAdd, dbGet, dbList, dbSet, dbUpdate } from "./store";
import type {
  AlertEvent, Attendance, ClassroomEvent, DeviceTag, HardwareDevice, Incident,
  PresenceLog, SyllabusTopic, SystemSettings, UserProfile,
} from "./types";

export const DEFAULT_SETTINGS: SystemSettings = {
  distanceThreshold: 5, entryGraceMin: 5, exitGraceMin: 5,
  noiseWarningDb: 70, noiseAlarmDb: 80, noiseDurationSec: 5,
  schoolStart: "09:15", schoolEnd: "16:00",
  engagementMinutes: 2, quizQuestions: 3, coverageThreshold: 85,
  heartbeatTimeoutSec: 90,
  airWeights: { attendance: 25, learning: 25, quiz: 20, assignments: 15, participation: 15 },
  mqttBroker: "wss://broker.emqx.io:8084/mqtt",
  mqttTopicIn: "nebula/school_demo/events",
  mqttTopicOut: "nebula/school_demo/commands",
  mqttUser: "", mqttPass: "",
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
export async function refreshTags(): Promise<void> { tags = await dbList<DeviceTag>("devices", { limit: 500 }); }
export function isConnected(): boolean { return client?.connected ?? false; }

const STAFF = ["hm", "meo", "deo", "admin"];

export async function connectHardware(): Promise<void> {
  if (client?.connected) return;
  // ROLE VERIFICATION: only HM/MEO/DEO/Admin browsers may listen to raw hardware events
  const role = state.profile?.role;
  if (role && !STAFF.includes(role)) {
    console.warn("[hardware] listener restricted to HM/MEO/DEO/Admin");
    emit("students & teachers do not listen to raw hardware events");
    return;
  }
  await loadSettings();
  await refreshTags();
  client = mqtt.connect(settings.mqttBroker, {
    clientId: "nebula-web-" + Math.random().toString(16).slice(2, 10),
    clean: true, connectTimeout: 8000,
    username: settings.mqttUser || undefined,
    password: settings.mqttPass || undefined,
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
  else console.warn("[hardware] not connected — command dropped");
}

/* ============ Website → Hardware commands ============ */
export function cmdTestBuzzer(room: string): void { publishCommand({ command: "TEST_BUZZER", room }); }
export function cmdRestartCamera(room: string, cameraId: string): void { publishCommand({ command: "RESTART_CAMERA", room, cameraId }); }
export function cmdCaptureBoard(room: string): void { publishCommand({ command: "CAPTURE_BOARD", room }); }
export function cmdPushThresholds(): void {
  publishCommand({
    command: "CHANGE_THRESHOLDS",
    noiseWarningDb: settings.noiseWarningDb, noiseAlarmDb: settings.noiseAlarmDb,
    distanceThreshold: settings.distanceThreshold, noiseDurationSec: settings.noiseDurationSec,
  });
}

async function handleRaw(text: string): Promise<void> {
  try { await processEvent(JSON.parse(text) as Record<string, unknown>); }
  catch { console.warn("Bad MQTT payload:", text.slice(0, 200)); }
}

/* ============ Universal event pipeline (persistent dedupe) ============ */

export async function processEvent(evt: Record<string, unknown>): Promise<void> {
  const role = state.profile?.role;
  if (role && !STAFF.includes(role)) return;

  const key = [evt.event, evt.ts ?? evt.timestamp, evt.tag_id ?? evt.student_id ?? evt.device_id ?? evt.room ?? ""].join("|");
  if (seen.has(key)) return;
  const dup = await dbList<ClassroomEvent>("classroomEvents", { where: [["eventId", "==", key]], limit: 1 }).catch(() => [] as ClassroomEvent[]);
  if (dup.length) { seen.add(key); return; }
  seen.add(key);
  if (seen.size > 600) {
    const keep = [...seen].slice(-300);
    seen.clear();
    keep.forEach((k) => seen.add(k));
  }

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
  const todays = await dbList<Attendance>("attendance", { where: [["date", "==", date]], limit: 500 });
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
  const rows = await dbList<HardwareDevice>("hardware", { where: [["deviceId", "==", deviceId]], limit: 1 });
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

/* Human-review-first: NO automatic behavior penalty (BUG #9). The penalty is
   applied by the HM when marking the incident reviewed (hm-incidents.ts). */
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
  const questions = generateQuiz(topic, subject, settings.quizQuestions);
  await dbAdd("quizRequests", {
    studentUid: dev.uid, studentName: dev.name, topic, subject, questions,
    status: "pending", createdBy: "hardware", createdAt: Date.now(),
  });
  await alert("engagement", "medium", `📵 ${dev.name}: possible prolonged disengagement (${settings.engagementMinutes}+ min) — quiz on "${topic}" awaiting teacher approval`, room);
}

async function handleSpeech(evt: Record<string, unknown>): Promise<void> {
  const text = String(evt.text ?? "");
  const room = String(evt.room ?? "");
  const todays = await dbList<SyllabusTopic>("syllabus", { where: [["date", "==", todayStr()]], limit: 50 });
  const words: string[] = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
  let best: { t: SyllabusTopic; score: number } | null = null;
  for (const t of todays) {
    const tw = String(t.topic).toLowerCase().match(/[a-z0-9]+/g) ?? [];
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
  const url = String(evt.url ?? "");                 // preferred: Storage URL from the Pi
  const image = url || String(evt.image ?? "");
  if (!image) return;
  if (!url && image.length > 900_000) {              // Firestore doc limit is 1 MB (POLISH #1)
    await alert("board", "medium", `📸 Board snapshot in ${room} too large for Firestore — upgrade Pi to Storage upload (url field)`, room);
    return;
  }
  await dbAdd("boardImages", { room, cameraId: String(evt.camera_id ?? "cam-board"), image, capturedAt: Date.now() });
  await alert("board", "low", `📸 Board snapshot captured in ${room} — pushed to student tabs`, room);
}

/* BUG #8 — honest wording. */
async function handleLeft(evt: Record<string, unknown>): Promise<void> {
  const tag = String(evt.tag_id ?? "");
  const room = String(evt.room ?? "");
  const dev = tags.find((d) => d.tagId === tag);
  if (!dev) return;
  const date = todayStr();
  const rows = await dbList<PresenceLog>("presence", { where: [["uid", "==", dev.uid]], limit: 50 });
  if (rows.some((p) => p.open && p.date === date)) return;
  await dbAdd("presence", { uid: dev.uid, name: dev.name, date, leftAt: Date.now(), open: true });
  await alert("attendance", "medium",
    `🚪 ${dev.name} left ${room} — grace period ${settings.exitGraceMin} min`, room);
}

/* BUG #8 — real auto-excuse: dismiss the matching exit alert when back in grace. */
async function handleReturned(evt: Record<string, unknown>): Promise<void> {
  const tag = String(evt.tag_id ?? "");
  const room = String(evt.room ?? "");
  const dev = tags.find((d) => d.tagId === tag);
  if (!dev) return;
  const date = todayStr();
  const rows = await dbList<PresenceLog>("presence", { where: [["uid", "==", dev.uid]], limit: 50 });
  const p = rows.find((x) => x.open && x.date === date);
  if (!p) return;
  const mins = Math.max(1, Math.round((Date.now() - p.leftAt) / 60000));
  await dbUpdate("presence", p.id, { open: false, returnedAt: Date.now(), minutesOut: mins });
  if (mins <= settings.exitGraceMin) {
    try {
      const exitAlerts = await dbList<AlertEvent>("alerts", { where: [["category", "==", "attendance"]], limit: 100 });
      const match = exitAlerts.find((a) =>
        a.status === "open" && a.room === room &&
        (a.message ?? "").includes(dev.name) && (a.message ?? "").includes("left"));
      if (match) {
        await dbUpdate("alerts", match.id, {
          status: "dismissed",
          notes: [...(match.notes ?? []), { by: "system", text: `Auto-dismissed: returned within grace (${mins} min)`, at: Date.now() }],
        });
      }
    } catch { /* non-fatal */ }
    await alert("attendance", "low", `↩️ ${dev.name} returned to ${room} after ${mins} min — within grace, excused`, room);
  } else {
    await alert("attendance", "high", `⏱ ${dev.name} was out of ${room} for ${mins} min (grace ${settings.exitGraceMin} min) — review`, room);
  }
}

/* AI detections are flags for human review, never automatic punishment. */
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
        const rows = await dbList<HardwareDevice>("hardware", { where: [["status", "==", "online"]], limit: 100 });
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
  await loadSettings();
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
    } as Incident);
    await alert("punctuality", "medium", `⏰ ${name} started class late (after ${settings.schoolStart})`);
  }
}
