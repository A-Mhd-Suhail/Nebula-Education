import { state } from "../state";
import { dbAdd, dbDelete, dbWatch } from "../store";
import { esc, showToast } from "../helpers";
import { CLASS_LIST, SUBJECTS, classLabel, createSearchableSelect, getSelectValue } from "../catalog";
import type { TimetableEntry } from "../types";

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const PERIODS = ["1", "2", "3", "4", "5", "6", "7", "8"];

export function render(root: HTMLElement): void {
  const me = state.profile!;
  const canEdit = me.role === "teacher" || me.role === "hm" || me.role === "admin";
  root.innerHTML = `
    <div class="card"><h3>🗓 Weekly timetable ${canEdit ? "— editor" : "— " + classLabel(me.className)}</h3>
      ${canEdit ? `<div id="tt-class-slot"></div>
        <div class="tt-form">
          <select id="tt-day">${DAYS.map((d) => `<option>${d}</option>`).join("")}</select>
          <select id="tt-period">${PERIODS.map((p) => `<option>P${p}</option>`).join("")}</select>
          <div id="tt-subj-slot"></div>
          <button id="tt-add" class="btn btn-primary" type="button">Add period</button>
        </div>` : ""}
    </div>
    <div id="tt-grid"></div>`;
  let className = me.className ?? "";

  if (canEdit) {
    (root.querySelector("#tt-class-slot") as HTMLElement).appendChild(createSearchableSelect("tt-class", CLASS_LIST, "🔍 Choose class…"));
    (root.querySelector("#tt-subj-slot") as HTMLElement).appendChild(createSearchableSelect("tt-subject", SUBJECTS, "🔍 Choose subject…"));
    (root.querySelector("#tt-add") as HTMLButtonElement).onclick = () => {
      className = getSelectValue("tt-class") || className;
      const subject = getSelectValue("tt-subject");
      const day = (root.querySelector("#tt-day") as HTMLSelectElement).value;
      const period = (root.querySelector("#tt-period") as HTMLSelectElement).value;
      if (!className || !subject) { showToast("Pick class + subject", "error"); return; }
      void dbAdd("timetable", { className, day, period, subject, teacherName: me.name });
      showToast("Period added ✅");
    };
  }

  const grid = root.querySelector("#tt-grid") as HTMLElement;
  dbWatch<TimetableEntry>("timetable", canEdit ? { limit: 200 } : { where: [["className", "==", className]], limit: 100 }, (rows) => {
    const list = canEdit ? rows.filter((r) => r.className === className) : rows;
    if (!list.length) { grid.innerHTML = `<p class="muted card">No periods set yet${canEdit ? " — add the first one above." : " for this class."}</p>`; return; }
    let html = `<div class="card"><table class="lb-table"><thead><tr><th>Day</th><th>Period</th><th>Subject</th><th>Teacher</th>${canEdit ? "<th></th>" : ""}</tr></thead><tbody>`;
    for (const d of DAYS) for (const p of PERIODS) {
      for (const c of list.filter((r) => r.day === d && r.period === p)) {
        html += `<tr><td>${esc(d)}</td><td>${esc(c.period)}</td><td>${esc(c.subject)}</td><td>${esc(c.teacherName ?? "—")}</td>${canEdit ? `<td><button class="btn btn-ghost" data-del="${c.id}" type="button" aria-label="Delete period">✖</button></td>` : ""}</tr>`;
      }
    }
    html += `</tbody></table></div>`;
    grid.innerHTML = html;
  });
  grid.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button[data-del]") as HTMLElement | null;
    if (b) void dbDelete("timetable", b.dataset.del!);
  };
}
