import { audit } from "../auditlog";
import { addViewListener } from "../router";
import { dbAdd, dbWatch } from "../store";
import { $, esc, showToast, todayStr } from "../helpers";
import { downloadCSV } from "../utils";
import type { Attendance, Incident, PresenceLog, UserProfile } from "../types";

let users: UserProfile[] = [];
let attToday: Attendance[] = [];
let incidents: Incident[] = [];
let presence: PresenceLog[] = [];

export function renderHmStudents(): void {
  const root = $("#hmstudents-root");
  root.innerHTML = `
    <div class="card">
      <h3>👨‍🎓 Student Management — Discipline, Presence & Attendance Master Log</h3>
      <p class="muted">Behavior starts at 100; hardware fight flags reduce it by 15 (after human review of the incident).
      <b>Override</b> manually marks a student present (e.g., lost tag).</p>
      <button class="btn" id="s-csv" type="button">⬇️ Export CSV</button>
    </div>
    <div class="card"><div id="s-table"><div class="loading">Loading…</div></div></div>`;

  addViewListener(dbWatch<UserProfile>("users", {}, (r) => { users = r; paint(); }));
  addViewListener(dbWatch<Attendance>("attendance", { where: [["date", "==", todayStr()]] }, (r) => { attToday = r; paint(); }));
  addViewListener(dbWatch<Incident>("incidents", {}, (r) => { incidents = r; paint(); }));
  addViewListener(dbWatch<PresenceLog>("presence", { limit: 200 }, (r) => { presence = r.filter((p) => p.date === todayStr()); paint(); }));

  $("#s-csv").addEventListener("click", () => {
    const rows: (string | number)[][] = [["Student", "ID", "Class", "Air Score", "Behavior", "Open incidents", "Presence", "Today"]];
    buildRows().forEach((r) => rows.push([r.name, r.sid, r.cls, r.air, r.behavior, r.inc, r.presence, r.today]));
    downloadCSV("students-master.csv", rows);
  });
}

function buildRows() {
  const students = users.filter((u) => u.role === "student");
  const presentUids = new Set(attToday.filter((a) => a.status === "present").map((a) => a.uid));
  return students.map((s) => {
    const inc = incidents.filter((i) => i.involvedIds.includes(s.uid) && i.status !== "resolved" && i.status !== "dismissed").length;
    const p = presence.find((x) => x.uid === s.uid && x.open);
    const pastOut = presence.filter((x) => x.uid === s.uid && !x.open);
    return {
      name: s.name, sid: s.studentId ?? "—", cls: s.className ?? "—",
      air: s.airScore ?? 0, behavior: s.behaviorScore ?? 100, inc,
      presence: p ? `🚪 Out since ${new Date(p.leftAt).toLocaleTimeString()}` : pastOut.length ? `↩️ ${pastOut.length} exit(s) today` : "In class",
      today: presentUids.has(s.uid) ? "Present" : "Absent",
      uid: s.uid,
    };
  });
}

function paint(): void {
  const box = $("#s-table");
  if (!box) return;
  const presentUids = new Set(attToday.filter((a) => a.status === "present").map((a) => a.uid));
  box.innerHTML = `<table class="table">
    <thead><tr><th>Student</th><th>ID</th><th>Class</th><th>Air Score</th><th>Behavior</th><th>Open incidents</th><th>Presence</th><th>Today</th><th>Action</th></tr></thead>
    <tbody>${buildRows().map((r) => `<tr>
      <td><b>${esc(r.name)}</b></td><td>${esc(r.sid)}</td><td>${esc(r.cls)}</td>
      <td>${r.air}</td>
      <td><span class="badge ${r.behavior >= 80 ? "green" : r.behavior >= 50 ? "orange" : "muted"}">${r.behavior}</span></td>
      <td>${r.inc ? `<span class="badge orange">${r.inc} open</span>` : "0"}</td>
      <td>${esc(r.presence)}</td>
      <td>${r.today === "Present" ? `<span class="badge green">Present</span>` : `<span class="badge muted">Absent</span>`}</td>
      <td>${presentUids.has(r.uid) ? `<span class="muted">—</span>`
        : `<button class="btn js-override" data-uid="${r.uid}" data-name="${esc(r.name)}" type="button">Override → Present</button>`}</td>
    </tr>`).join("") || `<tr><td colspan="9" class="muted">No students registered yet.</td></tr>`}</tbody></table>`;

  box.querySelectorAll(".js-override").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const el = b as HTMLElement;
      await dbAdd("attendance", {
        date: todayStr(), uid: el.dataset.uid!, name: el.dataset.name!,
        role: "student", status: "present", method: "manual-override", createdAt: Date.now(),
      });
      await audit("attendance_override", el.dataset.name!);
      showToast("Attendance manually overridden ✅");
    })()));
}