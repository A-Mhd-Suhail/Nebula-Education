import { cmdCaptureBoard } from "../hardware";
import { notifyUser } from "../notify";
import { addViewListener } from "../router";
import { state } from "../state";
import { dbAdd, dbWatch } from "../store";
import { $, esc, showToast, timeAgo, todayStr } from "../helpers";
import type {
  AlertEvent, Attendance, BoardImage, ClassroomEvent, ClassSession,
  NoiseEvent, SpeechLog, UserProfile,
} from "../types";

let students: UserProfile[] = [];
let attToday: Attendance[] = [];
let mySession: ClassSession | null = null;
let noise: NoiseEvent[] = [];
let events: ClassroomEvent[] = [];
let boards: BoardImage[] = [];
let speech: SpeechLog[] = [];
let initialized = false;

export function renderTeacherLive(): void {
  const me = state.profile;
  if (!me || me.role !== "teacher") return;
  const root = $("#teacherlive-root");
  root.innerHTML = `
    <div id="tl-banner"></div>
    <div class="card" id="tl-metrics"><div class="loading">Loading live metrics…</div></div>
    <div class="grid-2">
      <div class="card">
        <h3>🪑 Real-Time Attendance Grid — ${esc(me.className ?? "—")}</h3>
        <p class="muted">Green = detected (hardware tag / Tab link / override) · Red = not detected</p>
        <div class="desk-grid" id="desk-grid"><div class="loading">Loading…</div></div>
        <p class="muted" id="desk-count"></p>
      </div>
      <div class="card">
        <h3>🔔 Active Alerts (my class)</h3>
        <div id="tl-alerts" class="alert-feed"><div class="loading">Listening…</div></div>
        <hr>
        <h3>📢 Announcement → all my students</h3>
        <textarea class="js-ann" rows="2" placeholder="Announcement text…"></textarea>
        <button class="btn btn-primary js-ann-send" type="button">📣 Send announcement</button>
        <button class="btn js-board-cap" type="button">📷 Capture board</button>
        <hr>
        <h3>🚨 Manual Incident Report</h3>
        <label>Type
          <select class="js-i-type"><option value="misbehavior">Misbehavior</option><option value="fight">Fight / Bullying</option></select></label>
        <label>Students involved (names or IDs, comma separated)
          <input class="js-i-who" placeholder="Rahul, STU-2025-AB12"></label>
        <label>Description
          <textarea class="js-i-desc" rows="2" placeholder="What happened?"></textarea></label>
        <button class="btn btn-danger btn-block js-i-send" type="button">📨 Send Report to HM</button>
      </div>
    </div>`;

  if (!initialized) {
    initialized = true;
    root.querySelector(".js-i-send")!.addEventListener("click", () => void sendReport());
    root.querySelector(".js-ann-send")!.addEventListener("click", () => void sendAnnouncement());
    root.querySelector(".js-board-cap")!.addEventListener("click", () => {
      cmdCaptureBoard(me.className ?? "");
      showToast("📷 CAPTURE_BOARD sent to hardware");
    });
  }

  addViewListener(dbWatch<UserProfile>("users", {}, (rows) => {
    students = rows.filter((u) => u.role === "student" && u.className === me.className);
    paintDesks();
  }));
  addViewListener(dbWatch<Attendance>("attendance", { where: [["date", "==", todayStr()]] }, (rows) => { attToday = rows; paintDesks(); }));
  addViewListener(dbWatch<NoiseEvent>("noiseEvents", { limit: 100 }, (rows) => { noise = rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)); paintMetrics(); }));
  addViewListener(dbWatch<ClassroomEvent>("classroomEvents", { limit: 80 }, (rows) => {
    events = rows.sort((a, b) => (b.timestamp ?? 0) - (a.timestamp ?? 0));
    paintMetrics();
  }));
  addViewListener(dbWatch<BoardImage>("boardImages", { where: [["room", "==", me.className ?? ""]], limit: 10 }, (rows) => {
    boards = rows.sort((a, b) => (b.capturedAt ?? 0) - (a.capturedAt ?? 0));
    paintMetrics();
  }));
  addViewListener(dbWatch<SpeechLog>("speechLogs", { limit: 40 }, (rows) => {
    speech = rows.filter((s) => s.room === me.className).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    paintMetrics();
  }));
  addViewListener(dbWatch<AlertEvent>("alerts", { limit: 40 }, (rows) => {
    const mine = rows.filter((a) => a.room === me.className || a.priority === "critical")
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const box = $("#tl-alerts");
    if (box) {
      box.innerHTML = mine.slice(0, 8).map((a) => `
        <div class="alert-item">
          <span class="sev-badge ${a.priority}">${a.priority.toUpperCase()}</span>
          <span>${esc(a.message)}</span>
          <span class="muted">${timeAgo(a.createdAt)}</span>
        </div>`).join("") || `<p class="muted">No alerts. Class is calm. 😌</p>`;
    }
  }));
  addViewListener(dbWatch<ClassSession>("sessions", { where: [["active", "==", true]] }, (rows) => {
    mySession = rows.find((s) => s.teacherUid === me.uid) ?? null;
    const banner = $("#tl-banner");
    if (banner) {
      banner.innerHTML = mySession
        ? `<div class="live-banner">🔴 LIVE — ${esc(mySession.subject)} · started ${timeAgo(mySession.startedAt)}${mySession.scheduledStart ? ` · scheduled ${esc(mySession.scheduledStart)}` : ""}</div>`
        : "";
    }
    paintMetrics();
  }));
}

function paintMetrics(): void {
  const box = $("#tl-metrics");
  if (!box) return;
  const present = new Set(attToday.filter((a) => a.status === "present").map((a) => a.uid));
  const p = students.filter((s) => present.has(s.uid)).length;
  const n = noise.find((x) => x.room === (state.profile?.className ?? ""));
  const eng = events.find((e) => e.type === "ENGAGEMENT" && e.room === (state.profile?.className ?? ""));
  const topic = speech.find((s) => s.matchedTopic)?.matchedTopic ?? mySession?.subject ?? "—";
  const b = boards[0];
  box.innerHTML = `
    <h3>📡 LIVE CLASSROOM</h3>
    <div class="live-chips">
      <span class="chip ${p === students.length && students.length ? "green" : "orange"}">👤 Present: <b>${p}/${students.length}</b></span>
      <span class="chip ${n ? (n.level >= 80 ? "red" : "orange") : "green"}">🔊 Noise: <b>${n ? n.level + "dB" : "—"}</b></span>
      <span class="chip ${eng && Number(eng.confidence ?? 100) < 40 ? "orange" : "green"}">🧠 Engagement: <b>${eng ? esc(String(eng.meta ? JSON.parse(eng.meta).level ?? "—" : "—")) + "%" : "—"}</b></span>
      <span class="chip">📖 Topic: <b>${esc(topic)}</b></span>
      <span class="chip">📷 Board: <b>${b ? "updated " + timeAgo(b.capturedAt) : "—"}</b></span>
    </div>`;
}

function paintDesks(): void {
  const grid = $("#desk-grid");
  if (!grid) return;
  const present = new Set(attToday.filter((a) => a.status === "present").map((a) => a.uid));
  grid.innerHTML = students.map((s) => `
    <div class="desk ${present.has(s.uid) ? "present" : "absent"}">
      <div class="desk-name">${esc(s.name.split(" ")[0] ?? s.name)}</div>
      <div class="muted">${esc(s.studentId ?? "")}</div>
    </div>`).join("") || `<p class="muted">No students in your class yet.</p>`;
  const count = document.getElementById("desk-count");
  if (count) count.textContent = `${students.filter((s) => present.has(s.uid)).length}/${students.length} present`;
}

async function sendAnnouncement(): Promise<void> {
  const me = state.profile;
  if (!me) return;
  const text = ($(".js-ann") as HTMLTextAreaElement).value.trim();
  if (!text) { showToast("Write an announcement", "error"); return; }
  for (const s of students) await notifyUser(s.uid, "📣 " + me.name, text, "info");
  if (mySession) await dbAdd("contents", { sessionId: mySession.id, type: "note", text: "📢 " + text, createdAt: Date.now() });
  ($(".js-ann") as HTMLTextAreaElement).value = "";
  showToast("Announcement sent to all students 📣");
}

async function sendReport(): Promise<void> {
  const me = state.profile;
  if (!me) return;
  const type = ($(".js-i-type") as HTMLSelectElement).value as "misbehavior" | "fight";
  const whoRaw = ($(".js-i-who") as HTMLInputElement).value.trim();
  const description = ($(".js-i-desc") as HTMLTextAreaElement).value.trim();
  if (!whoRaw || !description) { showToast("Fill students involved and description", "error"); return; }
  const tokens = whoRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean);
  const matched = students.filter((s) =>
    tokens.includes(s.name.toLowerCase()) ||
    (s.studentId ? tokens.includes(s.studentId.toLowerCase()) : false));
  await dbAdd("incidents", {
    type, room: me.className ?? "", involvedIds: matched.map((m) => m.uid),
    involvedNames: matched.map((m) => m.name),
    description, status: "open", source: "teacher", priority: type === "fight" ? "high" : "medium",
    reportedBy: me.name, createdAt: Date.now(),
  });
  ($(".js-i-who") as HTMLInputElement).value = "";
  ($(".js-i-desc") as HTMLTextAreaElement).value = "";
  showToast("Report sent to HM portal 📨");
}