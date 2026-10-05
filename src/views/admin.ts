import { state } from "../state";
import { dbList } from "../store";
import { $, esc, todayStr } from "../helpers";
import type { Attendance, Doubt, UserProfile } from "../types";

export async function renderAdmin(): Promise<void> {
  const root = $("#admin-root");
  root.innerHTML = `<div class="loading">Loading overview…</div>`;

  const users = await dbList<UserProfile>("users");
  const students = users.filter((u) => u.role === "student");
  const teachers = users.filter((u) => u.role === "teacher");
  const top = [...students].sort((a, b) => (b.airScore ?? 0) - (a.airScore ?? 0)).slice(0, 5);
  const attendance = await dbList<Attendance>("attendance", { where: [["date", "==", todayStr()]] });
  const doubts = await dbList<Doubt>("doubts");
  const openDoubts = doubts.filter((d) => d.status === "open").length;

  root.innerHTML = `
    <div class="stat-grid">
      <div class="card stat"><h3>${students.length}</h3><p class="muted">Students</p></div>
      <div class="card stat"><h3>${teachers.length}</h3><p class="muted">Teachers</p></div>
      <div class="card stat"><h3>${openDoubts}</h3><p class="muted">Open doubts</p></div>
      <div class="card stat"><h3>${attendance.length}</h3><p class="muted">Attendance today</p></div>
    </div>
    <div class="grid-2">
      <div class="card"><h3>🏆 Top students (Air Score)</h3>
        <ol class="leaderboard">${top.map((s, i) => `
          <li><span class="rank">${["🥇", "🥈", "🥉"][i] ?? "#" + (i + 1)}</span>
          <span class="name">${esc(s.name)}</span><span class="score">${s.airScore ?? 0}</span></li>`).join("")
          || `<li class="muted">No students yet.</li>`}</ol>
      </div>
      <div class="card"><h3>📋 Today's attendance</h3>
        <ul class="att-list">${attendance.map((a) =>
          `<li>${esc(a.name)} — <b>${esc(a.status)}</b> <span class="muted">(${esc(a.method)})</span></li>`).join("")
          || `<li class="muted">No entries today.</li>`}</ul>
      </div>
    </div>`;
}