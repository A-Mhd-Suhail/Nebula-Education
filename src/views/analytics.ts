import { addViewListener } from "../router";
import { dbWatch } from "../store";
import { $, esc, todayStr } from "../helpers";
import { downloadCSV } from "../utils";
import type { Attendance, Incident, NoiseEvent, SyllabusTopic, UserProfile } from "../types";

let users: UserProfile[] = [];
let att: Attendance[] = [];
let inc: Incident[] = [];
let noise: NoiseEvent[] = [];
let syll: SyllabusTopic[] = [];

export function renderAnalytics(): void {
  const root = $("#analytics-root");
  root.innerHTML = `
    <div class="card"><h3>📊 Aggregated Analytics — Mandal / District level</h3>
      <p class="muted">Privacy by design: higher authorities see aggregated numbers and trends, not individual student/teacher surveillance data.</p></div>
    <div class="stat-grid" id="an-metrics"></div>
    <div class="card">
      <h3>🏫 Class-wise comparison</h3>
      <div id="an-table"></div>
      <br><button class="btn" id="an-csv" type="button">⬇️ Export CSV</button>
    </div>`;

  addViewListener(dbWatch<UserProfile>("users", {}, (r) => { users = r; paint(); }));
  addViewListener(dbWatch<Attendance>("attendance", { where: [["date", "==", todayStr()]] }, (r) => { att = r; paint(); }));
  addViewListener(dbWatch<Incident>("incidents", {}, (r) => { inc = r; paint(); }));
  addViewListener(dbWatch<NoiseEvent>("noiseEvents", {}, (r) => { noise = r; paint(); }));
  addViewListener(dbWatch<SyllabusTopic>("syllabus", {}, (r) => { syll = r; paint(); }));

  $("#an-csv").addEventListener("click", () => {
    const rows: (string | number)[][] = [["Class", "Students", "Present today", "Incidents", "Noise events", "Syllabus done"]];
    classRows().forEach((r) => rows.push([r.cls, r.students, r.present, r.incidents, r.noiseEv, r.done]));
    downloadCSV("analytics-classes.csv", rows);
  });
}

function classRows() {
  const classes = [...new Set(users.map((u) => u.className).filter(Boolean))] as string[];
  return classes.map((cls) => {
    const studs = users.filter((u) => u.role === "student" && u.className === cls);
    const present = studs.filter((s) => att.some((a) => a.uid === s.uid && a.status === "present")).length;
    return {
      cls, students: studs.length, present,
      incidents: inc.filter((i) => i.room === cls).length,
      noiseEv: noise.filter((n) => n.room === cls).length,
      done: syll.filter((s) => (s.doneByTeacher || s.doneByAI)).length,
    };
  });
}

function paint(): void {
  const studs = users.filter((u) => u.role === "student");
  const teach = users.filter((u) => u.role === "teacher");
  const present = att.filter((a) => a.role === "student" && a.status === "present").length;
  const pct = studs.length ? Math.round((present / studs.length) * 100) : 0;
  const open = inc.filter((i) => i.status === "open").length;
  const doneAll = syll.length ? Math.round((syll.filter((s) => s.doneByTeacher || s.doneByAI).length / syll.length) * 100) : 0;
  const m = $("#an-metrics");
  if (m) {
    m.innerHTML = `
      <div class="card stat"><h3>${studs.length}</h3><p class="muted">Students</p></div>
      <div class="card stat"><h3>${teach.length}</h3><p class="muted">Teachers</p></div>
      <div class="card stat"><h3>${pct}%</h3><p class="muted">Attendance today</p></div>
      <div class="card stat"><h3>${open}</h3><p class="muted">Open incidents</p></div>
      <div class="card stat"><h3>${noise.length}</h3><p class="muted">Noise events</p></div>
      <div class="card stat"><h3>${doneAll}%</h3><p class="muted">Syllabus coverage</p></div>`;
  }
  const t = $("#an-table");
  if (t) {
    t.innerHTML = `<table class="table">
      <thead><tr><th>Class</th><th>Students</th><th>Present today</th><th>Incidents</th><th>Noise events</th><th>Syllabus topics done</th></tr></thead>
      <tbody>${classRows().map((r) => `<tr><td><b>${esc(r.cls)}</b></td><td>${r.students}</td><td>${r.present}</td>
        <td>${r.incidents}</td><td>${r.noiseEv}</td><td>${r.done}</td></tr>`).join("")
        || `<tr><td colspan="6" class="muted">No classes yet.</td></tr>`}</tbody></table>`;
  }
}