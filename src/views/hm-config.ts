import { audit } from "../auditlog";
import { cmdPushThresholds, cmdTestBuzzer, DEFAULT_SETTINGS } from "../hardware";
import { addViewListener } from "../router";
import { dbAdd, dbDelete, dbGet, dbSet, dbWatch } from "../store";
import { $, esc, showToast, todayStr } from "../helpers";
import type { DeviceTag, HardwareDevice, SystemSettings, UserProfile } from "../types";

let users: UserProfile[] = [];
let tags: DeviceTag[] = [];
let hardware: HardwareDevice[] = [];

export function renderConfig(): void {
  const d = DEFAULT_SETTINGS;
  const root = $("#config-root");
  root.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <h3>🚸 Attendance Settings</h3>
        <label>BLE distance threshold (meters) <input id="cfg-dist" type="number" step="0.5" min="1" max="20" value="${d.distanceThreshold}"></label>
        <label>Entry grace period (min) <input id="cfg-entry" type="number" min="0" max="30" value="${d.entryGraceMin}"></label>
        <label>Exit grace period (min) <input id="cfg-exit" type="number" min="0" max="30" value="${d.exitGraceMin}"></label>
        <h3>🔊 Noise Settings</h3>
        <label>Warning dB <input id="cfg-nwarn" type="number" min="40" max="120" value="${d.noiseWarningDb}"></label>
        <label>Alarm dB <input id="cfg-nalarm" type="number" min="40" max="120" value="${d.noiseAlarmDb}"></label>
        <label>Alarm duration (sec) <input id="cfg-ndur" type="number" min="1" max="60" value="${d.noiseDurationSec}"></label>
        <button class="btn js-push" type="button">📡 Push thresholds to hardware</button>
      </div>
      <div class="card">
        <h3>👩‍🏫 Teacher Timing</h3>
        <label>School start (late-after) <input id="cfg-start" type="time" value="${d.schoolStart}"></label>
        <label>School end (early-before) <input id="cfg-end" type="time" value="${d.schoolEnd}"></label>
        <h3>🧠 Engagement</h3>
        <label>Detection duration (min) <input id="cfg-engmin" type="number" min="1" max="10" value="${d.engagementMinutes}"></label>
        <label>Quiz questions per trigger <input id="cfg-qq" type="number" min="1" max="5" value="${d.quizQuestions}"></label>
        <h3>📚 Syllabus</h3>
        <label>Coverage threshold (%) <input id="cfg-cov" type="number" min="0" max="100" value="${d.coverageThreshold}"></label>
        <h3>🔧 Hardware</h3>
        <label>Heartbeat offline timeout (sec) <input id="cfg-beat" type="number" min="30" max="600" value="${d.heartbeatTimeoutSec}"></label>
        <label>MQTT Broker <input id="cfg-broker" value="${esc(d.mqttBroker)}"></label>
        <label>Topic — events FROM hardware <input id="cfg-topicin" value="${esc(d.mqttTopicIn)}"></label>
        <label>Topic — commands TO hardware <input id="cfg-topicout" value="${esc(d.mqttTopicOut)}"></label>
      </div>
    </div>
    <div class="card">
      <h3>⚡ Air Score Weightage (%)</h3>
      <div class="role-fields">
        <label>Attendance <input id="w-att" type="number" min="0" max="100" value="${d.airWeights.attendance}"></label>
        <label>Learning <input id="w-learn" type="number" min="0" max="100" value="${d.airWeights.learning}"></label>
        <label>Quiz <input id="w-quiz" type="number" min="0" max="100" value="${d.airWeights.quiz}"></label>
        <label>Assignments <input id="w-ass" type="number" min="0" max="100" value="${d.airWeights.assignments}"></label>
        <label>Participation <input id="w-part" type="number" min="0" max="100" value="${d.airWeights.participation}"></label>
      </div>
      <p class="muted">Weights should total 100. Changing them affects the next recompute of every student's score.</p>
    </div>
    <div class="card">
      <h3>💾 Save</h3>
      <button class="btn btn-primary" id="cfg-save" type="button">💾 Save ALL Settings</button>
      <button class="btn js-buzz" type="button">🧪 Test buzzer</button>
    </div>

    <div class="grid-2">
      <div class="card">
        <h3>🏷️ Tag Assignment (ESP32 tag ID → person)</h3>
        <label>Person <select id="tag-user"></select></label>
        <label>Tag ID <input id="tag-id" placeholder="TAG-A1B2C3"></label>
        <label>Room <input id="tag-room" placeholder="Class 10-A"></label>
        <button class="btn btn-primary btn-block" id="tag-add" type="button">Assign Tag</button>
        <div id="tag-list" style="margin-top:12px"></div>
      </div>
      <div class="card">
        <h3>🗓️ Timetable & Syllabus Upload</h3>
        <p class="muted">One topic per line: <code>YYYY-MM-DD | Subject | Topic</code></p>
        <textarea id="syllabus-import" rows="4" placeholder="${esc(todayStr())} | Physics | Newton's Second Law"></textarea>
        <button class="btn btn-primary" id="syllabus-btn" type="button">📥 Import Syllabus</button>
        <hr>
        <h3>🔒 Privacy Notice</h3>
        <p class="muted">Classroom monitoring active — cameras: 3 · audio: enabled. Purpose: attendance, classroom safety, learning support and system analytics. AI flags always require human review before any action. In a real deployment, consent and local privacy law must be handled before collecting behavioural data.</p>
      </div>
    </div>

    <div class="card">
      <h3>🥧 Raspberry Pi — publish events (Python)</h3>
      <pre class="code-snippet">${esc(piSnippet())}</pre>
    </div>`;

  void (async () => {
    const s = await dbGet<SystemSettings>("settings", "hardware");
    const v = { ...DEFAULT_SETTINGS, ...(s ?? {}) };
    const set = (id: string, val: string | number): void => { const el = $(id) as HTMLInputElement; if (el) el.value = String(val); };
    set("#cfg-dist", v.distanceThreshold); set("#cfg-entry", v.entryGraceMin); set("#cfg-exit", v.exitGraceMin);
    set("#cfg-nwarn", v.noiseWarningDb); set("#cfg-nalarm", v.noiseAlarmDb); set("#cfg-ndur", v.noiseDurationSec);
    set("#cfg-start", v.schoolStart); set("#cfg-end", v.schoolEnd);
    set("#cfg-engmin", v.engagementMinutes); set("#cfg-qq", v.quizQuestions); set("#cfg-cov", v.coverageThreshold);
    set("#cfg-beat", v.heartbeatTimeoutSec); set("#cfg-broker", v.mqttBroker);
    set("#cfg-topicin", v.mqttTopicIn); set("#cfg-topicout", v.mqttTopicOut);
    const w = { ...DEFAULT_SETTINGS.airWeights, ...(v.airWeights ?? {}) };
    set("#w-att", w.attendance); set("#w-learn", w.learning); set("#w-quiz", w.quiz); set("#w-ass", w.assignments); set("#w-part", w.participation);
  })();

  $("#cfg-save").addEventListener("click", () => void (async () => {
    const num = (id: string, fb: number): number => Number(($(id) as HTMLInputElement).value) || fb;
    const data: SystemSettings = {
      distanceThreshold: num("#cfg-dist", 5), entryGraceMin: num("#cfg-entry", 5), exitGraceMin: num("#cfg-exit", 5),
      noiseWarningDb: num("#cfg-nwarn", 70), noiseAlarmDb: num("#cfg-nalarm", 80), noiseDurationSec: num("#cfg-ndur", 5),
      schoolStart: ($("#cfg-start") as HTMLInputElement).value || "09:15",
      schoolEnd: ($("#cfg-end") as HTMLInputElement).value || "16:00",
      engagementMinutes: num("#cfg-engmin", 2), quizQuestions: num("#cfg-qq", 3), coverageThreshold: num("#cfg-cov", 85),
      heartbeatTimeoutSec: num("#cfg-beat", 90),
      airWeights: {
        attendance: num("#w-att", 25), learning: num("#w-learn", 25), quiz: num("#w-quiz", 20),
        assignments: num("#w-ass", 15), participation: num("#w-part", 15),
      },
      mqttBroker: ($("#cfg-broker") as HTMLInputElement).value.trim() || DEFAULT_SETTINGS.mqttBroker,
      mqttTopicIn: ($("#cfg-topicin") as HTMLInputElement).value.trim() || DEFAULT_SETTINGS.mqttTopicIn,
      mqttTopicOut: ($("#cfg-topicout") as HTMLInputElement).value.trim() || DEFAULT_SETTINGS.mqttTopicOut,
    };
    await dbSet("settings", "hardware", data);
    await audit("settings_saved", "hardware & scoring settings");
    showToast("Settings saved ✅ (reconnect MQTT if broker changed)");
  })());

  $(".js-push").addEventListener("click", () => { cmdPushThresholds(); showToast("📡 Thresholds pushed to hardware"); });
  $(".js-buzz").addEventListener("click", () => { cmdTestBuzzer("all"); showToast("🧪 TEST_BUZZER sent"); });

  $("#tag-add").addEventListener("click", () => void (async () => {
    const uid = ($("#tag-user") as HTMLSelectElement).value;
    const tagId = ($("#tag-id") as HTMLInputElement).value.trim().toUpperCase();
    const room = ($("#tag-room") as HTMLInputElement).value.trim();
    const u = users.find((x) => x.uid === uid);
    if (!u || !tagId) { showToast("Pick a person and enter a tag ID", "error"); return; }
    if (tags.some((t) => t.tagId === tagId)) { showToast("Tag already assigned", "error"); return; }
    await dbAdd("devices", { tagId, uid: u.uid, name: u.name, role: u.role, room: room || u.className || "Room-1", createdAt: Date.now() });
    await audit("tag_assigned", tagId + " → " + u.name);
    ($("#tag-id") as HTMLInputElement).value = "";
    showToast(`Tag ${tagId} → ${u.name} ✅`);
  })());

  $("#syllabus-btn").addEventListener("click", () => void (async () => {
    const text = ($("#syllabus-import") as HTMLTextAreaElement).value;
    const lines = text.split(/\n+/).map((l) => l.trim()).filter(Boolean);
    let ok = 0, bad = 0;
    for (const line of lines) {
      const [date, subject, topic] = line.split("|").map((p) => p.trim());
      if (!date || !subject || !topic || !/^\d{4}-\d{2}-\d{2}$/.test(date)) { bad++; continue; }
      await dbAdd("syllabus", { date, subject, topic, doneByTeacher: false, doneByAI: false, createdAt: Date.now() });
      ok++;
    }
    ($("#syllabus-import") as HTMLTextAreaElement).value = "";
    await audit("syllabus_import", ok + " topics");
    showToast(`📥 Imported ${ok} topic(s)` + (bad ? ` · ${bad} skipped` : ""));
  })());

  addViewListener(dbWatch<UserProfile>("users", {}, (rows) => {
    users = rows;
    const sel = $("#tag-user") as HTMLSelectElement | null;
    if (sel) {
      const tagged = new Set(tags.map((t) => t.uid));
      sel.innerHTML = users.filter((u) => u.role === "student" || u.role === "teacher")
        .map((u) => `<option value="${u.uid}">${esc(u.name)} (${esc(u.role)})${tagged.has(u.uid) ? " ✔" : ""}</option>`).join("");
    }
  }));
  addViewListener(dbWatch<DeviceTag>("devices", {}, (rows) => {
    tags = rows;
    const list = $("#tag-list");
    if (list) {
      list.innerHTML = `<table class="table"><thead><tr><th>Tag</th><th>Person</th><th>Room</th><th></th></tr></thead>
        <tbody>${tags.map((t) => `<tr><td><b>${esc(t.tagId)}</b></td><td>${esc(t.name)}</td><td>${esc(t.room)}</td>
        <td><button class="btn btn-danger js-tag-del" data-id="${t.id}" type="button">✕</button></td></tr>`).join("")
        || `<tr><td colspan="4" class="muted">No tags yet.</td></tr>`}</tbody></table>`;
      list.querySelectorAll(".js-tag-del").forEach((b) =>
        b.addEventListener("click", () => void (async () => {
          await dbDelete("devices", (b as HTMLElement).dataset.id!);
          showToast("Tag removed");
        })()));
    }
  }));
}

function piSnippet(): string {
  return [
    "# pip install paho-mqtt   — publish to nebula/classroom/events",
    "send({'event':'ATTENDANCE','tag_id':'TAG-A1B2C3','distance':3.2,'room':'Class 10-A','ts':...})",
    "send({'event':'HEARTBEAT','device_id':'PI-001','type':'pi','room':'Class 10-A','cpuTemp':48,'cpuUsage':33,'ram':41,'fw':'v3.0.1','ts':...})",
    "send({'event':'NOISE_ALARM','room':'Class 10-A','level':85,'ts':...})",
    "send({'event':'FIGHT','room':'Class 10-A','involved_tags':['TAG-A1','TAG-B2'],'confidence':0.93,'ts':...})",
    "send({'event':'INATTENTION','student_id':'TAG-A1','topic':'Newton\'s Second Law','ts':...})",
    "send({'event':'SPEECH','room':'Class 10-A','text':'Today we learn Newton\'s Second Law','ts':...})",
    "send({'event':'BOARD_CAPTURE','room':'Class 10-A','camera_id':'cam-board-03','image':'<dataURL>','ts':...})",
    "send({'event':'STUDENT_LEFT','tag_id':'TAG-A1','room':'Class 10-A','ts':...})",
    "send({'event':'STUDENT_RETURNED','tag_id':'TAG-A1','room':'Class 10-A','ts':...})",
    "send({'event':'TEACHER_ACTIVITY','room':'Class 10-A','activity':'phone','teacher_name':'Ms.Rao','ts':...})",
    "send({'event':'ENGAGEMENT','room':'Class 10-A','level':72,'ts':...})",
    "# Commands arrive on nebula/classroom/commands: TEST_BUZZER, RESTART_CAMERA,",
    "# CAPTURE_BOARD, SESSION_START/END, CHANGE_THRESHOLDS, TRIGGER_BUZZER",
  ].join("\n");
}