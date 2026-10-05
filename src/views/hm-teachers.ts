import { addViewListener } from "../router";
import { dbGet, dbList, dbWatch } from "../store";
import { $, esc, todayStr } from "../helpers";
import { isToday, toMinutes, downloadCSV } from "../utils";
import type { Attendance, ClassSession, SyllabusTopic, SystemSettings, UserProfile } from "../types";

let users: UserProfile[] = [];
let attToday: Attendance[] = [];
let sessions: ClassSession[] = [];
let syllabus: SyllabusTopic[] = [];
let schoolStart = "09:15";
let schoolEnd = "16:00";
let coverage = 85;

export function renderHmTeachers(): void {
  const root = $("#hmteachers-root");
  root.innerHTML = `
    <div class="card">
      <h3>👨‍🏫 Teacher Management — Timing & Syllabus Progress</h3>
      <p class="muted">Arrival compares first login/detection vs scheduled start (<b id="t-start">${esc(schoolStart)}</b>);
      departure vs scheduled end (<b id="t-end">${esc(schoolEnd)}</b>). Coverage threshold: <b id="t-cov">${coverage}%</b>.</p>
      <button class="btn" id="t-csv" type="button">⬇️ Export CSV</button>
    </div>
    <div class="card"><div id="t-table"><div class="loading">Loading…</div></div></div>`;

  void dbGet<SystemSettings>("settings", "hardware").then((s) => {
    if (s?.schoolStart) schoolStart = s.schoolStart;
    if (s?.schoolEnd) schoolEnd = s.schoolEnd;
    if (s?.coverageThreshold) coverage = s.coverageThreshold;
    const a = document.getElementById("t-start");
    const b = document.getElementById("t-end");
    const c = document.getElementById("t-cov");
    if (a) a.textContent = schoolStart;
    if (b) b.textContent = schoolEnd;
    if (c) c.textContent = String(coverage);
    paint();
  });

  addViewListener(dbWatch<UserProfile>("users", {}, (r) => { users = r; paint(); }));
  addViewListener(dbWatch<Attendance>("attendance", { where: [["date", "==", todayStr()]] }, (r) => { attToday = r; paint(); }));
  addViewListener(dbWatch<ClassSession>("sessions", { limit: 200 }, (r) => { sessions = r; paint(); }));
  void dbList<SyllabusTopic>("syllabus").then((r) => { syllabus = r; paint(); });

  $("#t-csv").addEventListener("click", () => {
    const rows: (string | number)[][] = [["Teacher", "Subject", "Class", "Arrival", "Status", "Sessions", "On-time %", "Coverage %", "Syllabus status"]];
    buildRows().forEach((r) => rows.push([r.name, r.subject, r.cls, r.arrival, r.late, r.sessionCount, r.onTime, r.coverage, r.status]));
    downloadCSV("teacher-report.csv", rows);
  });
}

function buildRows() {
  return users.filter((u) => u.role === "teacher").map((t) => {
    const arrivals = attToday.filter((a) => a.uid === t.uid).map((a) => a.createdAt).sort();
    const arrival = arrivals.length ? new Date(arrivals[0]!) : null;
    const late = arrival ? (arrival.getHours() * 60 + arrival.getMinutes()) > toMinutes(schoolStart) : null;

    const mySessions = sessions.filter((s) => s.teacherUid === t.uid);
    const todays = mySessions.filter((s) => isToday(s.startedAt));
    const onTimeCount = todays.filter((s) => {
      const d = new Date(s.startedAt);
      return d.getHours() * 60 + d.getMinutes() <= toMinutes(schoolStart);
    }).length;
    const onTime = todays.length ? Math.round((onTimeCount / todays.length) * 100) : -1;

    const planned = syllabus.filter((s) => s.subject === (t.subject ?? "General") && s.date <= todayStr());
    const done = planned.filter((s) => s.doneByTeacher || s.doneByAI).length;
    const cov = planned.length ? Math.round((done / planned.length) * 100) : -1;
    let status = "No plan";
    if (cov >= 0) {
      if (cov >= 100 && syllabus.some((s) => s.subject === (t.subject ?? "General") && s.date > todayStr())) status = "Ahead 🚀";
      else if (cov >= coverage) status = "On Track ✅";
      else if (cov >= 60) status = "Slightly Behind";
      else status = "Behind ⚠️";
    }
    return {
      name: t.name, subject: t.subject ?? "—", cls: t.className ?? "—",
      arrival: arrival ? arrival.toLocaleTimeString() : "—",
      late: late === null ? "not logged in" : late ? `LATE` : "On time",
      sessionCount: mySessions.length,
      onTime: onTime < 0 ? "—" : onTime + "%",
      coverage: cov < 0 ? "—" : cov + "%",
      status,
    };
  });
}

function paint(): void {
  const box = $("#t-table");
  if (!box) return;
  const rows = buildRows();
  box.innerHTML = `<table class="table">
    <thead><tr><th>Teacher</th><th>Subject</th><th>Class</th><th>Arrival today</th><th>Punctuality</th><th>Sessions</th><th>On-time</th><th>Syllabus coverage</th><th>Status</th></tr></thead>
    <tbody>${rows.map((r) => `<tr>
      <td><b>${esc(r.name)}</b></td><td>${esc(r.subject)}</td><td>${esc(r.cls)}</td>
      <td>${esc(r.arrival)}</td>
      <td>${r.late === "not logged in" ? `<span class="muted">not logged in</span>` : r.late === "LATE" ? `<span class="badge orange">LATE</span>` : `<span class="badge green">On time</span>`}</td>
      <td>${r.sessionCount}</td><td>${esc(r.onTime)}</td>
      <td><div class="progress"><div class="bar" style="width:${r.coverage === "—" ? 0 : r.coverage}"></div></div><span class="muted">${esc(r.coverage)}</span></td>
      <td><span class="badge ${r.status.includes("Ahead") || r.status.includes("On Track") ? "green" : r.status === "No plan" ? "muted" : "orange"}">${esc(r.status)}</span></td>
    </tr>`).join("") || `<tr><td colspan="9" class="muted">No teachers registered yet.</td></tr>`}</tbody></table>`;
}
