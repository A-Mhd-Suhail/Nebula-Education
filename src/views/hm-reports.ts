import { addViewListener } from "../router";
import { dbList, dbWatch } from "../store";
import { $, esc, showToast, todayStr } from "../helpers";
import { downloadCSV } from "../utils";
import type { Attendance, Incident, MarkEntry, Submission, SyllabusTopic, UserProfile } from "../types";

let users: UserProfile[] = [];

export function renderReports(): void {
  const root = $("#reports-root");
  root.innerHTML = `
    <div class="grid-2">
      <div class="card"><h3>🧑‍🎓 Student Report</h3>
        <label>Student <select id="rep-student"></select></label>
        <button class="btn btn-primary js-student" type="button">Generate + CSV</button>
        <div id="rep-student-out"></div>
      </div>
      <div class="card"><h3>👩‍🏫 Teacher Report</h3>
        <label>Teacher <select id="rep-teacher"></select></label>
        <button class="btn btn-primary js-teacher" type="button">Generate + CSV</button>
        <div id="rep-teacher-out"></div>
      </div>
      <div class="card"><h3>🏫 Classroom Report</h3>
        <label>Class <select id="rep-class"></select></label>
        <button class="btn btn-primary js-class" type="button">Generate + CSV</button>
        <div id="rep-class-out"></div>
      </div>
      <div class="card"><h3>🌍 School Report</h3>
        <button class="btn btn-primary js-school" type="button">Generate + CSV</button>
        <div id="rep-school-out"></div>
      </div>
    </div>
    <p class="muted">Exports download as CSV (opens in Excel). PDF export can be added via browser print.</p>`;

  const unsub = dbWatch<UserProfile>("users", {}, (rows) => {
    users = rows;
    fill("#rep-student", rows.filter((u) => u.role === "student"));
    fill("#rep-teacher", rows.filter((u) => u.role === "teacher"));
    const classes = [...new Set(rows.map((u) => u.className).filter(Boolean))] as string[];
    ($("#rep-class") as HTMLSelectElement).innerHTML =
      classes.map((c) => `<option value="${esc(c)}">${esc(c)}</option>`).join("");
  });
  addViewListener(unsub);

  $(".js-student").addEventListener("click", () => void studentReport());
  $(".js-teacher").addEventListener("click", () => void teacherReport());
  $(".js-class").addEventListener("click", () => void classReport());
  $(".js-school").addEventListener("click", () => void schoolReport());
}

function fill(sel: string, list: UserProfile[]): void {
  const el = $(sel) as HTMLSelectElement;
  el.innerHTML = list.map((u) => `<option value="${u.uid}">${esc(u.name)} (${esc(u.className ?? "")})</option>`).join("");
}

async function studentReport(): Promise<void> {
  const uid = ($("#rep-student") as HTMLSelectElement).value;
  const me = users.find((u) => u.uid === uid);
  if (!me) { showToast("Pick a student", "error"); return; }
  const [att, marks, subs, inc, allAtt] = await Promise.all([
    dbList<Attendance>("attendance", { where: [["uid", "==", uid]] }),
    dbList<MarkEntry>("marks", { where: [["studentUid", "==", uid]] }),
    dbList<Submission>("submissions", { where: [["studentUid", "==", uid]] }),
    dbList<Incident>("incidents", {}),
    dbList<Attendance>("attendance", {}),
  ]);
  const myDays = att.filter((a) => a.status === "present").map((a) => a.date);
  const allDays = new Set(allAtt.map((a) => a.date));
  const pct = allDays.size ? Math.round((new Set(myDays).size / allDays.size) * 100) : 0;
  const myInc = inc.filter((i) => i.involvedIds.includes(uid));
  const out = $("#rep-student-out")!;
  out.innerHTML = `
    <div class="profile-row"><span>Attendance</span><b>${pct}% (${new Set(myDays).size}/${allDays.size} days)</b></div>
    <div class="profile-row"><span>Air Score</span><b>${me.airScore ?? 0}</b></div>
    <div class="profile-row"><span>Behavior</span><b>${me.behaviorScore ?? 100}</b></div>
    <div class="profile-row"><span>Quizzes taken</span><b>${marks.length}</b></div>
    <div class="profile-row"><span>Assignments submitted</span><b>${subs.length}</b></div>
    <div class="profile-row"><span>Incidents</span><b>${myInc.length}</b></div>`;
  const rows: (string | number)[][] = [["Student", me.name], ["Attendance %", pct], ["Air Score", me.airScore ?? 0], [],
    ["Exam", "Subject", "Score", "Total"]];
  marks.forEach((m) => rows.push([m.exam, m.subject, m.score, m.total]));
  rows.push([]);
  rows.push(["Incident", "Status", "Description"]);
  myInc.forEach((i) => rows.push([i.type, i.status, i.description]));
  downloadCSV(`student-${me.name.replace(/\s+/g, "_")}.csv`, rows);
}

async function teacherReport(): Promise<void> {
  const uid = ($("#rep-teacher") as HTMLSelectElement).value;
  const t = users.find((u) => u.uid === uid);
  if (!t) { showToast("Pick a teacher", "error"); return; }
  const [att, sessions, inc, ratings, syllabus] = await Promise.all([
    dbList<Attendance>("attendance", { where: [["date", "==", todayStr()]] }),
    dbList<{ id: string; teacherUid: string; startedAt: number; actualEnd?: number }>("sessions", {}),
    dbList<Incident>("incidents", {}),
    dbList<{ id: string; teacherUid: string; stars: number }>("ratings", {}),
    dbList<SyllabusTopic>("syllabus", {}),
  ]);
  const mine = sessions.filter((s) => s.teacherUid === uid);
  const todaySessions = mine.filter((s) => new Date(s.startedAt).toDateString() === new Date().toDateString());
  const arrivals = att.filter((a) => a.uid === uid).map((a) => a.createdAt).sort();
  const myRatings = ratings.filter((r) => r.teacherUid === uid);
  const avg = myRatings.length ? (myRatings.reduce((s, r) => s + r.stars, 0) / myRatings.length).toFixed(1) : "—";
  const myInc = inc.filter((i) => i.involvedNames.includes(t.name));
  const done = syllabus.filter((s) => s.subject === (t.subject ?? "General") && (s.doneByTeacher || s.doneByAI)).length;
  const out = $("#rep-teacher-out")!;
  out.innerHTML = `
    <div class="profile-row"><span>Arrival today</span><b>${arrivals.length ? new Date(arrivals[0]!).toLocaleTimeString() : "—"}</b></div>
    <div class="profile-row"><span>Sessions total</span><b>${mine.length} (today ${todaySessions.length})</b></div>
    <div class="profile-row"><span>Student rating</span><b>${avg} /5</b></div>
    <div class="profile-row"><span>Syllabus topics done</span><b>${done}</b></div>
    <div class="profile-row"><span>Incidents</span><b>${myInc.length}</b></div>`;
  const rows: (string | number)[][] = [["Teacher", t.name], ["Sessions", mine.length], ["Rating", avg], ["Incidents", myInc.length], [],
    ["Session start", "Session end"]];
  mine.forEach((s) => rows.push([new Date(s.startedAt).toLocaleString(), s.actualEnd ? new Date(s.actualEnd).toLocaleString() : "—"]));
  downloadCSV(`teacher-${t.name.replace(/\s+/g, "_")}.csv`, rows);
}

async function classReport(): Promise<void> {
  const cls = ($("#rep-class") as HTMLSelectElement).value;
  if (!cls) { showToast("No class selected", "error"); return; }
  const [att, noise, inc, usersAll] = await Promise.all([
    dbList<Attendance>("attendance", { where: [["date", "==", todayStr()]] }),
    dbList<{ id: string; room: string; level: number }>("noiseEvents", {}),
    dbList<Incident>("incidents", {}),
    dbList<UserProfile>("users", {}),
  ]);
  const studs = usersAll.filter((u) => u.role === "student" && u.className === cls);
  const present = studs.filter((s) => att.some((a) => a.uid === s.uid && a.status === "present")).length;
  const n = noise.filter((x) => x.room === cls);
  const i = inc.filter((x) => x.room === cls);
  const out = $("#rep-class-out")!;
  out.innerHTML = `
    <div class="profile-row"><span>Students</span><b>${studs.length}</b></div>
    <div class="profile-row"><span>Present today</span><b>${present}/${studs.length}</b></div>
    <div class="profile-row"><span>Noise events</span><b>${n.length}</b></div>
    <div class="profile-row"><span>Incidents</span><b>${i.length}</b></div>`;
  const rows: (string | number)[][] = [["Class", cls], ["Students", studs.length], ["Present today", present], ["Noise events", n.length], ["Incidents", i.length]];
  downloadCSV(`class-${cls.replace(/\s+/g, "_")}.csv`, rows);
}

async function schoolReport(): Promise<void> {
  const [usersAll, att, inc] = await Promise.all([
    dbList<UserProfile>("users", {}),
    dbList<Attendance>("attendance", { where: [["date", "==", todayStr()]] }),
    dbList<Incident>("incidents", {}),
  ]);
  const studs = usersAll.filter((u) => u.role === "student");
  const teach = usersAll.filter((u) => u.role === "teacher");
  const present = att.filter((a) => a.role === "student" && a.status === "present").length;
  const pct = studs.length ? Math.round((present / studs.length) * 100) : 0;
  const out = $("#rep-school-out")!;
  out.innerHTML = `
    <div class="profile-row"><span>Students</span><b>${studs.length}</b></div>
    <div class="profile-row"><span>Teachers</span><b>${teach.length}</b></div>
    <div class="profile-row"><span>Attendance today</span><b>${pct}%</b></div>
    <div class="profile-row"><span>Incidents total</span><b>${inc.length}</b></div>`;
  downloadCSV("school-report.csv", [["Students", studs.length], ["Teachers", teach.length], ["Attendance %", pct], ["Incidents", inc.length]]);
}