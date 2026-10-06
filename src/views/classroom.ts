import { state } from "../state";
import { dbWatch } from "../store";
import { esc } from "../helpers";
import { classLabel } from "../catalog";
import type { UserProfile } from "../types";

export function render(root: HTMLElement): void {
  const me = state.profile!;
  root.innerHTML = `
    <div class="card"><h3>🏫 ${classLabel(me.className)}</h3><p class="muted small">Everyone in your class — students ranked by AIR.</p></div>
    <h3>🎓 Students</h3><div id="cl-students" class="stack"><p class="muted">Loading…</p></div>
    <h3>🧑‍🏫 Teachers</h3><div id="cl-teachers" class="stack"><p class="muted">Loading…</p></div>`;
  const sEl = root.querySelector("#cl-students") as HTMLElement;
  const tEl = root.querySelector("#cl-teachers") as HTMLElement;

  dbWatch<UserProfile>("users", { where: [["role", "==", "student"]], limit: 400 }, (rows) => {
    const students = rows.filter((u) => u.className === me.className).sort((a, b) => (b.airScore ?? 0) - (a.airScore ?? 0));
    sEl.innerHTML = students.length
      ? students.map((u, i) => `<div class="card small-card"><b>#${i + 1} ${esc(u.name)}</b> · AIR ${u.airScore ?? 0} · behavior ${u.behaviorScore ?? 100}</div>`).join("")
      : `<p class="muted">No classmates registered yet.</p>`;
  });
  dbWatch<UserProfile>("users", { where: [["role", "==", "teacher"]], limit: 100 }, (rows) => {
    const teachers = rows.filter((u) => u.className === me.className);
    tEl.innerHTML = teachers.length
      ? teachers.map((u) => `<div class="card small-card"><b>${esc(u.name)}</b> · ${esc(u.subject ?? "—")}</div>`).join("")
      : `<p class="muted">No teachers assigned to this class yet.</p>`;
  });
}
