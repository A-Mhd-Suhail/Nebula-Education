// src/hardware/engines.ts — the 8-feature rule engine (browser relay over your firebase.ts)
import type { User, QuizDoc, Topic, Attendance } from "../firebase";
import { hwApi } from "./api";
import {
  CFG, safeAdd, safeSet, safeGet, safeList,
  todayKey, dowToday, minsOfDay, hhmmToMin,
  userByTag, sessionForClass, roomToClass, touchDevice,
} from "./store";
import { presenceTouch, onPersonLeave } from "./presence";

/* ============================================================
 * FEATURE 1 · STUDENT ATTENDANCE (entry/exit/late, idempotent)
 * ============================================================ */
const attMeta = new Map<string, { arrivedAt: number; date: string; wrote: boolean }>();
let seenToday = new Set<string>();
let seenDate = "";

async function alreadyMarked(uid: string): Promise<boolean> {
  const d = todayKey();
  if (seenDate !== d) {
    seenToday = new Set();
    const rows = await safeList<Attendance>("attendance", ["date", d]);
    rows?.forEach((r) => seenToday.add(r.uid));
    seenDate = d;
  }
  return seenToday.has(uid);
}

async function studentArrive(u: User, _roomId: string): Promise<void> {
  if (attMeta.has(u.uid)) return;
  const d = todayKey();
  const exists = await alreadyMarked(u.uid);
  const late = minsOfDay() > hhmmToMin(CFG.dayStart) + CFG.attendanceLateAfterMin;
  let wrote = false;
  if (!exists) {
    wrote = await safeSet("attendance", `${u.uid}-${d}`, {
      date: d, uid: u.uid, name: u.name, role: u.role,
      method: "ble-tag", createdAt: Date.now(),
      status: late ? "late" : "present",
    });
    if (wrote) seenToday.add(u.uid);
  }
  attMeta.set(u.uid, { arrivedAt: Date.now(), date: d, wrote });
}

async function studentLeave(u: User): Promise<void> {
  const meta = attMeta.get(u.uid);
  if (!meta) return;
  attMeta.delete(u.uid);
  if (!meta.wrote) return; // pre-existing record (different id) — don't touch
  await safeSet("attendance", `${u.uid}-${meta.date}`, {
    exitAt: Date.now(),
    durationMin: Math.round((Date.now() - meta.arrivedAt) / 60000),
  });
}

/* ============================================================
 * FEATURE 2 · TEACHER TIMING (timetable + late / early exit)
 * ============================================================ */
interface Slot {
  id: string; className: string; subject?: string;
  teacherUid?: string; dow: number; startMin: number; endMin: number;
}
let slots: Slot[] = []; let slotsAt = 0;
async function timetableSlots(): Promise<Slot[]> {
  if (Date.now() - slotsAt > 60000) {
    slots = (await safeList<Slot>("timetable", ["dow", dowToday()])) ?? [];
    slotsAt = Date.now();
  }
  return slots;
}
const tMeta = new Map<string, { slot: Slot; lateMin: number; id: string }>();

async function teacherArrive(u: User, roomId: string): Promise<void> {
  if (tMeta.has(u.uid)) return;
  const cls = (await roomToClass(roomId)) ?? u.className ?? null;
  const m = minsOfDay();
  await safeAdd("teacher_activity", {
    teacherUid: u.uid, name: u.name, eventType: "entered",
    roomId: roomId || null, createdAt: Date.now(),
  });
  const slot = (await timetableSlots()).find((s) =>
    s.startMin <= m && m < s.endMin &&
    (s.teacherUid === u.uid || (!!cls && s.className === cls)));
  if (!slot) return;
  const lateMin = Math.max(0, m - slot.startMin);
  const id = `${u.uid}-${todayKey()}-${slot.startMin}`;
  tMeta.set(u.uid, { slot, lateMin, id });
  await safeSet("teacher_timing", id, {
    date: todayKey(), teacherUid: u.uid, teacherName: u.name,
    className: slot.className, subject: slot.subject ?? null,
    slotStart: slot.startMin, slotEnd: slot.endMin,
    entryAt: Date.now(), lateMin,
    status: lateMin > 0 ? "late" : "on_time",
  });
}

async function teacherLeave(u: User): Promise<void> {
  const meta = tMeta.get(u.uid);
  tMeta.delete(u.uid);
  await safeAdd("teacher_activity", {
    teacherUid: u.uid, name: u.name, eventType: "exited", createdAt: Date.now(),
  });
  if (!meta) return;
  const earlyMin = Math.max(0, meta.slot.endMin - minsOfDay());
  await safeSet("teacher_timing", meta.id, {
    exitAt: Date.now(), earlyMin,
    status: earlyMin >= CFG.teacherEarlyExitMin
      ? "early_exit"
      : (meta.lateMin > 0 ? "late" : "on_time"),
  });
}

/* ============================================================
 * FEATURE 3 · INCIDENT DETECTION (severity + alerts + ack)
 * ============================================================ */
async function onCamera(roomId: string | undefined, deviceId: string | undefined, p: Record<string, unknown>): Promise<void> {
  void touchDevice(deviceId, roomId);
  const conf = Number(p.confidence ?? 0);
  if (conf < CFG.incidentMediumConf) return; // ignore low-confidence noise
  const severity = conf >= CFG.incidentHighConf ? "high" : "medium";
  const eventType = String(p.event_type ?? "other");
  const ref = await safeAdd("incidents", {
    roomId: roomId ?? null, cameraId: deviceId ?? null,
    eventType, confidence: conf, severity, status: "new",
    durationSec: Number(p.duration_sec ?? 0) || null,
    clipUrl: String(p.clip_url ?? "") || null,
    createdAt: Date.now(),
  });
  if (ref) await safeAdd("hardware_alerts", {
    type: "incident",
    severity: severity === "high" ? "critical" : "warning",
    title: `Possible ${eventType} detected`,
    body: `Confidence ${(conf * 100).toFixed(0)}%`,
    roomId: roomId ?? null, refId: ref, refCol: "incidents",
    status: "open", createdAt: Date.now(),
  });
}

export async function ackIncident(id: string, by: string, falseAlarm = false): Promise<void> {
  await safeSet("incidents", id, {
    status: falseAlarm ? "false_alarm" : "acknowledged",
    ackBy: by, ackAt: Date.now(),
  });
  const alerts = await safeList<{ id: string }>("hardware_alerts", ["refId", id]);
  for (const a of alerts ?? []) {
    await safeSet("hardware_alerts", a.id, { status: falseAlarm ? "false_alarm" : "closed" });
  }
}

/* ============================================================
 * FEATURE 4 · ENGAGEMENT (score → disengagement → QUIZ push)
 * ============================================================ */
interface EngState { win: Array<[number, number]>; lastWrite: number; lastIntervention: number; }
const eng = new Map<string, EngState>();
let quizPool: QuizDoc[] = []; let quizAt = 0;
const FALLBACK_QUIZ: QuizDoc[] = [
  { id: "hw-fb-1", subject: "General", question: "What does CPU stand for?",
    options: ["Central Process Unit", "Central Processing Unit", "Computer Personal Unit", "Central Program Unit"], correctIndex: 1 },
  { id: "hw-fb-2", subject: "General", question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Mercury"], correctIndex: 1 },
];

async function quizzes(): Promise<QuizDoc[]> {
  if (Date.now() - quizAt > 120000) {
    const rows = await safeList<QuizDoc>("quizzes");
    quizPool = rows && rows.length ? rows : FALLBACK_QUIZ;
    quizAt = Date.now();
  }
  return quizPool;
}

async function onEngagement(roomId: string | undefined, p: Record<string, unknown>): Promise<void> {
  let uid = String(p.studentId ?? p.student_id ?? "");
  if (!uid && p.tag) { const u = await userByTag(String(p.tag)); uid = u?.uid ?? ""; }
  if (!uid) return;
  const s = p.signals as Record<string, number> | undefined;
  const score = typeof p.engagement === "number"
    ? p.engagement
    : 0.5 * (s?.head_forward ?? 0) + 0.3 * (s?.activity ?? 0) + 0.2 * (s?.tab_active ?? 0);
  const st = eng.get(uid) ?? { win: [], lastWrite: 0, lastIntervention: 0 };
  st.win.push([Date.now(), score]);
  if (st.win.length > 180) st.win.shift();
  eng.set(uid, st);

  if (Date.now() - st.lastWrite > 20000) { // throttled score writes
    st.lastWrite = Date.now();
    await safeAdd("engagement_scores", { studentUid: uid, roomId: roomId ?? null, score, createdAt: Date.now() });
  }

  // sustained disengagement (last sample ≥ 0.4)
  let lastEngaged = -1;
  for (const [t, v] of st.win) if (v >= 0.4) lastEngaged = t;
  if (lastEngaged < 0) lastEngaged = st.win.length ? st.win[0][0] : Date.now();
  const disSec = (Date.now() - lastEngaged) / 1000;
  if (disSec >= CFG.engagementInterveneMin * 60 && Date.now() - st.lastIntervention > 10 * 60000) {
    st.lastIntervention = Date.now();
    await intervene(uid);
  }
}

async function intervene(uid: string): Promise<void> {
  const pool = await quizzes();
  const u = await safeGet<User>("users", uid);
  const session = await sessionForClass(u?.className);
  await safeAdd("engagement_interventions", {
    studentUid: uid, sessionId: session?.id ?? null,
    reason: "long_disengagement",
    action: session ? "quiz_sent" : "no_live_class",
    createdAt: Date.now(),
  });
  if (!session) return;
  const q = pool[Math.floor(Math.random() * pool.length)];
  // EXACT shape your TestsSection sends → appears as "Class Test" in the student's existing Tab
  await safeAdd("contents", {
    sessionId: session.id, type: "test", text: q.question,
    quiz: { question: q.question, options: q.options, correctIndex: q.correctIndex, subject: q.subject },
    createdAt: Date.now(),
  });
}

/* ============================================================
 * FEATURE 5 · SYLLABUS VERIFICATION (topic match → doneAI flip)
 * ============================================================ */
const toks = (t: string): string[] =>
  t.toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/).filter((w) => w.length >= 3);

let topics: Topic[] = []; let topicsAt = 0;
async function syllabusTopics(): Promise<Topic[]> {
  if (Date.now() - topicsAt > 60000) {
    topics = (await safeList<Topic>("syllabus")) ?? [];
    topicsAt = Date.now();
  }
  return topics;
}

export async function matchSyllabus(text: string): Promise<Topic | null> {
  const clean = text.trim();
  if (!clean) return null;
  const tset = new Set(toks(clean));
  if (!tset.size) return null;
  let best: Topic | null = null;
  let bestScore = 0;
  for (const t of await syllabusTopics()) {
    const tt = [...new Set(toks(`${t.topic} ${t.subject ?? ""}`))];
    if (!tt.length) continue;
    let hit = 0;
    for (const w of tt) if (tset.has(w)) hit += 1;
    const score = hit / tt.length;
    if (score > bestScore) { bestScore = score; best = t; }
  }
  if (!best || bestScore < CFG.syllabusMatchThreshold) return null;
  if (!best.doneAI) await safeSet("syllabus", best.id, { doneAI: true }); // → badge flips in your Timetable UI
  await safeAdd("teaching_logs", {
    topicId: best.id, topic: best.topic, subject: best.subject ?? null,
    confidence: Number(bestScore.toFixed(2)), snippet: clean.slice(0, 300),
    source: "ai", createdAt: Date.now(),
  });
  return best;
}

export async function syllabusProgress(): Promise<Array<{ subject: string; covered: number; total: number; pct: number }>> {
  const rows = await syllabusTopics();
  const by = new Map<string, { covered: number; total: number }>();
  for (const t of rows) {
    const k = t.subject ?? "General";
    const e = by.get(k) ?? { covered: 0, total: 0 };
    e.total += 1;
    if (t.doneAI || t.doneTeacher) e.covered += 1;
    by.set(k, e);
  }
  return [...by.entries()].map(([subject, v]) => ({
    subject, ...v, pct: v.total ? Math.round((v.covered / v.total) * 100) : 0,
  }));
}

/* ============================================================
 * FEATURE 6 · TEACHER ACTIVITY (events + absence alerts)
 * ============================================================ */
async function onTeacherActivity(p: Record<string, unknown>, roomId?: string): Promise<void> {
  let uid = String(p.teacherId ?? p.teacher_id ?? "");
  let name = "";
  if (!uid && p.tag) { const u = await userByTag(String(p.tag)); uid = u?.uid ?? ""; name = u?.name ?? ""; }
  if (!uid) return;
  if (!name) { const u = await safeGet<User>("users", uid); name = u?.name ?? ""; }
  const eventType = String(p.event_type ?? p.eventType ?? "event");
  const durSec = Number(p.duration_sec ?? p.duration ?? 0);
  await safeAdd("teacher_activity", {
    teacherUid: uid, name, eventType, durationSec: durSec,
    confidence: p.confidence ?? null, roomId: roomId ?? null, createdAt: Date.now(),
  });
  const durMin = durSec / 60;
  if ((eventType === "inactive" || eventType === "absent") && durMin >= CFG.absenceAlertMin) {
    await safeAdd("hardware_alerts", {
      type: "teacher_activity", severity: "warning",
      title: "Teacher absence detected",
      body: `${name || uid} inactive ${Math.round(durMin)} min`,
      roomId: roomId ?? null, refId: null,
      status: "open", createdAt: Date.now(),
    });
  }
}

/* ============================================================
 * FEATURE 7 · NOISE (sustained events + buzzer control)
 * ============================================================ */
const noiseWin = new Map<string, Array<[number, number]>>();
const noiseLast = new Map<string, number>();

async function onNoise(roomId: string | undefined, deviceId: string | undefined, p: Record<string, unknown>): Promise<void> {
  void touchDevice(deviceId, roomId);
  const db = Number(p.db_level ?? p.db ?? 0);
  if (!db || !roomId) return;
  const win = noiseWin.get(roomId) ?? [];
  win.push([Date.now(), db]);
  while (win.length && Date.now() - win[0][0] > 120000) win.shift();
  noiseWin.set(roomId, win);

  const level = db >= CFG.noiseHighDb ? "high" : db >= CFG.noiseWarnDb ? "warning" : "ok";
  const lastLog = noiseLast.get(roomId + ":log") ?? 0;
  if (level !== "ok" && Date.now() - lastLog > 30000) { // throttled live log
    noiseLast.set(roomId + ":log", Date.now());
    await safeAdd("hardware_events", {
      kind: "noise", roomId, deviceId: deviceId ?? null,
      dbLevel: db, level, createdAt: Date.now(),
    });
  }
  if (level === "ok") return;

  let over = win[0][0];
  for (const [t, v] of win) if (v < CFG.noiseWarnDb) over = t;
  const durSec = (Date.now() - over) / 1000;
  const lastEvt = noiseLast.get(roomId) ?? 0;
  if (durSec >= CFG.noiseMinDurationSec && Date.now() - lastEvt > 45000) {
    noiseLast.set(roomId, Date.now());
    const peak = win.reduce((m, [, v]) => Math.max(m, v), 0);
    const fireBuzzer = peak > CFG.noiseHighDb && !!deviceId;
    await safeAdd("noise_events", {
      roomId, peakDb: peak, durationSec: Math.round(durSec),
      startedAt: Date.now() - durSec * 1000, endedAt: Date.now(),
      buzzerFired: fireBuzzer,
    });
    if (fireBuzzer && deviceId) {
      void hwApi.sendCommand(deviceId, "buzzer_on", { duration: CFG.buzzerSec }); // software → hardware
    }
    await safeAdd("hardware_alerts", {
      type: "noise", severity: "warning",
      title: `High noise (${Math.round(peak)} dB)`,
      body: `Sustained ${Math.round(durSec)}s`,
      roomId, refId: null, status: "open", createdAt: Date.now(),
    });
  }
}

/* ============================================================
 * FEATURE 8 · BOARD CAPTURE (store → topic link → Tab delivery)
 * ============================================================ */
const pageCounter = new Map<string, number>();
async function onBoardChange(roomId: string | undefined, deviceId: string | undefined, p: Record<string, unknown>): Promise<void> {
  void touchDevice(deviceId, roomId);
  const ocr = String(p.ocr_text ?? p.ocr ?? "");
  const img = typeof p.image_b64 === "string" ? p.image_b64 : "";
  const cls = await roomToClass(roomId);
  const session = await sessionForClass(cls ?? undefined);
  const key = session?.id ?? roomId ?? "na";
  const page = (pageCounter.get(key) ?? 0) + 1;
  pageCounter.set(key, page);

  let topicId: string | null = null;
  let topicName: string | null = null;
  if (ocr) {
    const t = await matchSyllabus(ocr); // features 8 → 5 hookup
    if (t) { topicId = t.id; topicName = t.topic; }
  }
  const doc: Record<string, unknown> = {
    roomId: roomId ?? null, sessionId: session?.id ?? null, deviceId: deviceId ?? null,
    pageNumber: page, ocrText: ocr, topicId, topicName, createdAt: Date.now(),
  };
  if (img && img.length <= 600000) doc.imageB64 = img;
  else if (img) doc.imageTooLarge = true;
  await safeAdd("board_captures", doc);

  if (session && ocr) {
    // EXISTING UI: shows as a Note in every student's Tab stream
    await safeAdd("contents", {
      sessionId: session.id, type: "note",
      text: `📋 Board — Page ${page}\n${ocr}`, createdAt: Date.now(),
    });
  }
}

/* ============================================================
 * ROUTER + wiring
 * ============================================================ */
export async function routeEvent(
  type: string,
  roomId: string | undefined,
  deviceId: string | undefined,
  payload: Record<string, unknown>,
): Promise<void> {
  switch (type) {
    case "ble_ping": {
      const tag = String(payload.tag_id ?? payload.tag ?? "");
      if (!tag) return;
      const u = await userByTag(tag);
      if (!u) return;
      if (!presenceTouch(tag, u, roomId ?? "")) return; // only on arrival
      if (u.role === "teacher") await teacherArrive(u, roomId ?? "");
      else await studentArrive(u, roomId ?? "");
      return;
    }
    case "noise":           return onNoise(roomId, deviceId, payload);
    case "camera_event":    return onCamera(roomId, deviceId, payload);
    case "board_change":    return onBoardChange(roomId, deviceId, payload);
    case "engagement":      return onEngagement(roomId, payload);
    case "teacher_activity": return onTeacherActivity(payload, roomId);
    case "syllabus_detect": {
      const text = String(payload.text ?? payload.transcript ?? "");
      if (text) await matchSyllabus(text);
      return;
    }
    case "heartbeat":
    case "device_status":   return touchDevice(deviceId, roomId, true);
    default: return;
  }
}

export function startEngines(): void {
  onPersonLeave(async (tag, user) => {
    if (user.role === "teacher") await teacherLeave(user);
    else await studentLeave(user);
  });
}
