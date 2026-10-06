import { audit } from "../auditlog";
import {
  connectHardware, disconnectHardware, onHardwareStatus, simulateAttendance, simulateBoard,
  simulateEngagement, simulateFight, simulateHeartbeat, simulateInattention, simulateNoise,
  simulateSpeech, simulateStudentLeft, simulateStudentReturned, simulateTeacherActivity,
} from "../hardware";
import { addViewListener } from "../router";
import { dbAdd, dbWatch } from "../store";
import { $, esc, showToast, todayStr } from "../helpers";
import type {
  AlertEvent, Attendance, ClassSession, DeviceTag, HardwareDevice,
  Incident, NoiseEvent, UserProfile,
} from "../types";

let users: UserProfile[] = [];
let sessions: ClassSession[] = [];
let incidents: Incident[] = [];
let alerts: AlertEvent[] = [];
let attToday: Attendance[] = [];
let tags: DeviceTag[] = [];
let hardware: HardwareDevice[] = [];
let noise: NoiseEvent[] = [];
let selectedRoom = "";
let initialized = false;

export function renderHmDashboard(): void {
  const root = $("#hmdash-root");
  root.innerHTML = `
    <div class="card">
      <h3>📡 Hardware / MQTT Connection</h3>
      <div class="profile-row"><span>Status</span><b><span id="hw-dot" class="status-dot off"></span> <span id="hw-text">Disconnected</span></b></div>
      <div class="profile-row"><span>Broker</span><b class="muted" id="hw-broker">—</b></div>
      <div class="profile-row"><span>Topic (in)</span><b class="muted" id="hw-topic">—</b></div>
      <div class="quick-row">
        <button class="btn btn-primary" id="hw-connect" type="button">🔌 Connect MQTT</button>
        <button class="btn" id="hw-disconnect" type="button">⏏ Disconnect</button>
      </div>
    </div>

    <div class="stat-grid" id="metrics"></div>

    <h3>🗺️ Live Classroom Map (click a room)</h3>
    <div class="map-grid" id="map-grid"><div class="loading">Loading…</div></div>
    <div id="room-detail"></div>

    <div class="grid-2" style="margin-top:16px">
      <div class="card">
        <h3>🚨 Real-Time Alert Feed</h3>
        <div id="alert-feed" class="alert-feed"><div class="loading">Listening…</div></div>
      </div>
      <div class="card sim-panel">
        <h3>🧪 Hardware Simulator (demo without a Pi)</h3>
        <p class="muted" style="margin-bottom:8px">Fires the exact MQTT events the Raspberry Pi sends.</p>
        <div class="quick-row">
          <button class="btn btn-primary" id="sim-assign" type="button">⚡ Assign tags to everyone</button>
          <button class="btn" id="sim-hwset" type="button">🥧 Register demo hardware set</button>
        </div>
        <div class="sim-row"><label>Student</label><select id="sim-student"></select></div>
        <div class="sim-row"><label>Teacher</label><select id="sim-teacher"></select></div>
        <div class="sim-row"><label>Class / Room</label><select id="sim-class"></select></div>
        <div class="sim-row"><label>Topic</label><input id="sim-topic" value="Newton's Second Law"></div>
        <div class="quick-row">
          <button class="btn" id="sim-att" type="button">✅ Attendance</button>
          <button class="btn" id="sim-noise" type="button">🔊 Noise</button>
          <button class="btn" id="sim-fight" type="button">🥊 Fight</button>
        </div>
        <div class="quick-row">
          <button class="btn" id="sim-inatt" type="button">📵 Disengagement</button>
          <button class="btn" id="sim-speech" type="button">🗣️ Speech→AI</button>
          <button class="btn" id="sim-board" type="button">📸 Board</button>
        </div>
        <div class="quick-row">
          <button class="btn" id="sim-left" type="button">🚪 Student left</button>
          <button class="btn" id="sim-back" type="button">↩️ Returned</button>
        </div>
        <div class="quick-row">
          <select id="sim-activity"><option value="phone">phone</option><option value="left">left</option><option value="inactive">inactive</option><option value="unusual">unusual</option></select>
          <button class="btn" id="sim-tact" type="button">👩‍🏫 Teacher activity</button>
          <button class="btn" id="sim-eng" type="button">🧠 Engagement 45%</button>
        </div>
        <button class="btn btn-block" id="sim-beat" type="button">💓 Send hardware heartbeats</button>
      </div>
    </div>`;

  if (!initialized) {
    initialized = true;
    $("#hw-connect").addEventListener("click", () => void connectHardware());
    $("#hw-disconnect").addEventListener("click", () => disconnectHardware());
    $("#sim-assign").addEventListener("click", () => void autoAssign());
    $("#sim-hwset").addEventListener("click", () => void demoHardware());
    $("#sim-att").addEventListener("click", () => void simAtt());
    $("#sim-noise").addEventListener("click", () => void simNoise());
    $("#sim-fight").addEventListener("click", () => void simFight());
    $("#sim-inatt").addEventListener("click", () => void simInatt());
    $("#sim-speech").addEventListener("click", () => void simSpeech());
    $("#sim-board").addEventListener("click", () => void simBoard());
    $("#sim-left").addEventListener("click", () => void simLeft());
    $("#sim-back").addEventListener("click", () => void simBack());
    $("#sim-tact").addEventListener("click", () => void simTact());
    $("#sim-eng").addEventListener("click", () => void simEng());
    $("#sim-beat").addEventListener("click", () => void simBeat());
    onHardwareStatus((s) => {
      const dot = document.getElementById("hw-dot");
      const txt = document.getElementById("hw-text");
      const br = document.getElementById("hw-broker");
      const tp = document.getElementById("hw-topic");
      if (dot) dot.className = "status-dot " + (s.connected ? "on" : "off");
      if (txt) txt.textContent = s.error ? "Error: " + s.error : (s.connected ? "Connected — listening for hardware" : "Disconnected");
      if (br) br.textContent = s.broker;
      if (tp) tp.textContent = s.topicIn;
    });
  }

  addViewListener(dbWatch<UserProfile>("users", {}, (r) => { users = r; paintSim(); paint(); }));
  addViewListener(dbWatch<ClassSession>("sessions", { where: [["active", "==", true]] }, (r) => { sessions = r; paint(); }));
  addViewListener(dbWatch<Incident>("incidents", {}, (r) => { incidents = r; paint(); }));
  addViewListener(dbWatch<AlertEvent>("alerts", { limit: 60 }, (r) => { alerts = r.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)); paint(); }));
  addViewListener(dbWatch<Attendance>("attendance", { where: [["date", "==", todayStr()]] }, (r) => { attToday = r; paint(); }));
  addViewListener(dbWatch<DeviceTag>("devices", {}, (r) => { tags = r; paintSim(); }));
  addViewListener(dbWatch<HardwareDevice>("hardware", {}, (r) => { hardware = r; paint(); }));
  addViewListener(dbWatch<NoiseEvent>("noiseEvents", { limit: 100 }, (r) => { noise = r.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0)); paint(); }));
}

function rooms(): string[] {
  const s = new Set<string>();
  users.forEach((u) => { if (u.className) s.add(u.className); });
  sessions.forEach((x) => s.add(x.className));
  tags.forEach((d) => { if (d.room) s.add(d.room); });
  return [...s].sort();
}

function paint(): void {
  const students = users.filter((u) => u.role === "student");
  const presentUids = new Set(attToday.filter((a) => a.status === "present").map((a) => a.uid));
  const presentStudents = students.filter((s) => presentUids.has(s.uid)).length;
  const openInc = incidents.filter((i) => i.status === "open");
  const critToday = alerts.filter((a) => a.priority === "critical" && new Date(a.createdAt).toDateString() === new Date().toDateString()).length;
  const pct = students.length ? Math.round((presentStudents / students.length) * 100) : 0;
  const hwOnline = hardware.filter((h) => h.status === "online").length;

  const metrics = document.getElementById("metrics");
  if (metrics) {
    metrics.innerHTML = `
      <div class="card stat"><h3>${students.length}</h3><p class="muted">Students</p></div>
      <div class="card stat"><h3>${users.filter((u) => u.role === "teacher").length}</h3><p class="muted">Teachers</p></div>
      <div class="card stat"><h3>${pct}%</h3><p class="muted">Attendance today</p></div>
      <div class="card stat"><h3>${sessions.length}</h3><p class="muted">Classes running</p></div>
      <div class="card stat"><h3>${openInc.length}</h3><p class="muted">Open incidents</p></div>
      <div class="card stat"><h3>${critToday}</h3><p class="muted">Critical alerts</p></div>
      <div class="card stat"><h3>${hwOnline}/${hardware.length}</h3><p class="muted">Hardware online</p></div>
      <div class="card stat"><h3>${noise.length}</h3><p class="muted">Noise events</p></div>`;
  }

  const map = document.getElementById("map-grid");
  if (map) {
    map.innerHTML = rooms().map((room) => {
      const session = sessions.find((s) => s.className === room);
      const hasAlert = openInc.some((i) => i.room === room) || alerts.some((a) => a.room === room && a.priority === "critical" && a.status === "open");
      const cls = hasAlert ? "alert" : session ? "live" : "idle";
      const rStuds = students.filter((s) => s.className === room);
      const present = rStuds.filter((s) => presentUids.has(s.uid)).length;
      const lastNoise = noise.find((n) => n.room === room);
      return `<div class="room-card ${cls} js-room" data-room="${esc(room)}" style="cursor:pointer">
        <div class="room-name">${esc(room)}</div>
        <div class="room-meta">${session ? `👩‍🏫 ${esc(session.teacherName)} · ${esc(session.subject)}` : "No live class"}</div>
        <div class="room-meta">${present}/${rStuds.length} present${lastNoise ? ` · 🔊 ${lastNoise.level}dB` : ""}${hasAlert ? " · 🚨" : ""}</div>
      </div>`;
    }).join("") || `<p class="muted">No rooms yet — rooms appear from user class names.</p>`;
    map.querySelectorAll(".js-room").forEach((el) =>
      el.addEventListener("click", () => { selectedRoom = (el as HTMLElement).dataset.room!; paintDetail(); }));
  }

  const feed = document.getElementById("alert-feed");
  if (feed) {
    feed.innerHTML = alerts.slice(0, 25).map((a) => `
      <div class="alert-item">
        <span class="sev-badge ${a.priority}">${a.priority.toUpperCase()}</span>
        <span>${esc(a.message)}</span>
        <span class="muted">${new Date(a.createdAt).toLocaleTimeString()}</span>
      </div>`).join("") || `<p class="muted">No alerts yet. Connect hardware or use the simulator.</p>`;
  }
  paintDetail();
}

function paintDetail(): void {
  const box = document.getElementById("room-detail");
  if (!box) return;
  if (!selectedRoom) { box.innerHTML = ""; return; }
  const session = sessions.find((s) => s.className === selectedRoom);
  const studs = users.filter((u) => u.role === "student" && u.className === selectedRoom);
  const presentUids = new Set(attToday.filter((a) => a.status === "present").map((a) => a.uid));
  const present = studs.filter((s) => presentUids.has(s.uid)).length;
  const lastNoise = noise.find((n) => n.room === selectedRoom);
  const roomAlerts = alerts.filter((a) => a.room === selectedRoom).slice(0, 5);
  const hw = hardware.filter((h) => h.room === selectedRoom);
  box.innerHTML = `
    <div class="card">
      <h3>🔎 ${esc(selectedRoom)} — live details</h3>
      <div class="profile-row"><span>Teacher</span><b>${session ? esc(session.teacherName) : "—"}</b></div>
      <div class="profile-row"><span>Subject</span><b>${session ? esc(session.subject) : "—"}</b></div>
      <div class="profile-row"><span>Present</span><b>${present}/${studs.length}</b></div>
      <div class="profile-row"><span>Last noise</span><b>${lastNoise ? `${lastNoise.level}dB at ${new Date(lastNoise.createdAt).toLocaleTimeString()}` : "—"}</b></div>
      <div class="profile-row"><span>Hardware</span><b>${hw.filter((h) => h.status === "online").length}/${hw.length} online</b></div>
      <h4>Recent alerts</h4>
      ${roomAlerts.map((a) => `<div class="alert-item"><span class="sev-badge ${a.priority}">${a.priority}</span><span>${esc(a.message)}</span></div>`).join("") || `<p class="muted">None.</p>`}
    </div>`;
}

function paintSim(): void {
  const sel = document.getElementById("sim-student") as HTMLSelectElement | null;
  if (sel) {
    const list = tags.filter((d) => d.role === "student");
    sel.innerHTML = list.map((d) => `<option value="${d.tagId}">${esc(d.name)} (${esc(d.tagId)})</option>`).join("")
      || `<option value="">— assign tags first —</option>`;
  }
  const tsel = document.getElementById("sim-teacher") as HTMLSelectElement | null;
  if (tsel) {
    const list = tags.filter((d) => d.role === "teacher");
    tsel.innerHTML = list.map((d) => `<option value="${esc(d.name)}">${esc(d.name)}</option>`).join("")
      || `<option value="">— no teacher tags —</option>`;
  }
  const cls = document.getElementById("sim-class") as HTMLSelectElement | null;
  if (cls) cls.innerHTML = rooms().map((r) => `<option value="${esc(r)}">${esc(r)}</option>`).join("");
}

async function autoAssign(): Promise<void> {
  const tagged = new Set(tags.map((d) => d.uid));
  const targets = users.filter((u) => (u.role === "student" || u.role === "teacher") && !tagged.has(u.uid));
  for (const u of targets) {
    await dbAdd("devices", {
      tagId: "TAG-" + u.uid.slice(0, 6).toUpperCase(),
      uid: u.uid, name: u.name, role: u.role,
      room: u.className ?? "Room-1", createdAt: Date.now(),
    });
  }
  showToast(targets.length ? `⚡ Assigned ${targets.length} tag(s)` : "Everyone already has a tag");
}

async function demoHardware(): Promise<void> {
  const room = ($("#sim-class") as HTMLSelectElement).value || "Class 10-A";
  const set: [string, HardwareDevice["type"]][] = [
    ["PI-001", "pi"], ["ESP-001", "esp32"], ["CAM-TEACHER-01", "camera"],
    ["CAM-STUDENTS-02", "camera"], ["CAM-BOARD-03", "camera"], ["MIC-001", "mic"], ["BUZZ-001", "buzzer"],
  ];
  const existing = new Set(hardware.map((h) => h.deviceId));
  for (const [deviceId, type] of set) {
    if (existing.has(deviceId)) continue;
    await dbAdd("hardware", { deviceId, type, room, status: "online", lastSeen: Date.now(), fw: "v3.0.1" });
  }
  await audit("demo_hardware_registered", room);
  showToast("🥧 Demo hardware set registered for " + room);
}

function needStudentTag(): string | null {
  const v = ($("#sim-student") as HTMLSelectElement).value;
  if (!v) { showToast("Assign tags first (⚡ button)", "error"); return null; }
  return v;
}
function needRoom(): string | null {
  const v = ($("#sim-class") as HTMLSelectElement).value;
  if (!v) { showToast("No room selected", "error"); return null; }
  return v;
}

async function simAtt(): Promise<void> { const t = needStudentTag(); if (t) { await simulateAttendance(t); showToast("📡 ATTENDANCE sent"); } }
async function simNoise(): Promise<void> { const r = needRoom(); if (r) { await simulateNoise(r); showToast("📡 NOISE_ALARM sent"); } }
async function simFight(): Promise<void> {
  const r = needRoom(); if (!r) return;
  const inRoom = tags.filter((d) => d.role === "student" && d.room === r);
  if (inRoom.length < 2) { showToast("Need 2 tagged students in that room", "error"); return; }
  await simulateFight(r, [inRoom[0]!.tagId, inRoom[1]!.tagId]);
  showToast("📡 FIGHT sent");
}
async function simInatt(): Promise<void> {
  const t = needStudentTag(); if (!t) return;
  const topic = ($("#sim-topic") as HTMLInputElement).value.trim() || "Current topic";
  await simulateInattention(t, topic);
  showToast("📡 INATTENTION sent — check Quiz Approvals");
}
async function simSpeech(): Promise<void> {
  const r = needRoom(); if (!r) return;
  const topic = ($("#sim-topic") as HTMLInputElement).value.trim() || "the lesson";
  await simulateSpeech(r, `Today we are learning about ${topic}`);
  showToast("📡 SPEECH sent — AI syllabus check");
}
async function simBoard(): Promise<void> {
  const r = needRoom(); if (!r) return;
  const topic = ($("#sim-topic") as HTMLInputElement).value.trim() || "Board notes";
  await simulateBoard(r, topic);
  showToast("📡 BOARD_CAPTURE sent");
}
async function simLeft(): Promise<void> { const t = needStudentTag(); if (t) { await simulateStudentLeft(t); showToast("📡 STUDENT_LEFT sent"); } }
async function simBack(): Promise<void> { const t = needStudentTag(); if (t) { await simulateStudentReturned(t); showToast("📡 STUDENT_RETURNED sent"); } }
async function simTact(): Promise<void> {
  const r = needRoom(); if (!r) return;
  const name = ($("#sim-teacher") as HTMLSelectElement).value || "Teacher";
  const kind = ($("#sim-activity") as HTMLSelectElement).value;
  await simulateTeacherActivity(r, kind, name);
  showToast("📡 TEACHER_ACTIVITY sent");
}
async function simEng(): Promise<void> { const r = needRoom(); if (r) { await simulateEngagement(r, 45); showToast("📡 ENGAGEMENT sent"); } }
async function simBeat(): Promise<void> {
  for (const h of hardware) await simulateHeartbeat(h.deviceId, h.type, h.room);
  showToast("💓 Heartbeats sent — Hardware Health page updates");
}