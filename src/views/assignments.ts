import { recomputeAirScore } from "../airscore";
import { audit } from "../auditlog";
import { addViewListener } from "../router";
import { state } from "../state";
import { dbAdd, dbUpdate, dbWatch } from "../store";
import { $, esc, showToast, timeAgo } from "../helpers";
import type { Assignment, Submission } from "../types";

let mine: Assignment[] = [];
let subs: Submission[] = [];

export function renderAssignments(): void {
  const me = state.profile!;
  const root = $("#assignments-root");
  root.innerHTML = `
    <div class="card">
      <h3>📘 Assignments — create, review submissions, give marks</h3>
      <div class="role-fields">
        <label>Title <input id="as-title" placeholder="Assignment title"></label>
        <label>Due date <input id="as-due" type="date"></label>
        <label>Max marks <input id="as-max" type="number" min="1" value="10"></label>
        <label>Class <input id="as-class" value="${esc(me.className ?? "")}"></label>
      </div>
      <br><button class="btn btn-primary" id="as-add" type="button">➕ Create Assignment</button>
    </div>
    <div id="as-list"><div class="loading">Loading…</div></div>`;

  $("#as-add").addEventListener("click", () => void (async () => {
    const title = ($("#as-title") as HTMLInputElement).value.trim();
    if (!title) { showToast("Title required", "error"); return; }
    await dbAdd("assignments", {
      title,
      dueDate: ($("#as-due") as HTMLInputElement).value,
      maxMarks: Number(($("#as-max") as HTMLInputElement).value) || 10,
      className: ($("#as-class") as HTMLInputElement).value.trim() || me.className || "Class 10-A",
      subject: me.subject ?? "General",
      by: me.name, teacherUid: me.uid, createdAt: Date.now(),
    });
    await audit("assignment_create", title);
    ($("#as-title") as HTMLInputElement).value = "";
    showToast("Assignment created 📘");
  })());

  addViewListener(dbWatch<Assignment>("assignments", { limit: 100 }, (rows) => {
    mine = rows.filter((a) => a.teacherUid === me.uid || a.by === me.name)
      .sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    paint();
  }));
  addViewListener(dbWatch<Submission>("submissions", { limit: 300 }, (rows) => { subs = rows; paint(); }));
}

function paint(): void {
  const box = $("#as-list");
  if (!box) return;
  box.innerHTML = mine.map((a) => {
    const mySubs = subs.filter((s) => s.assignmentId === a.id)
      .sort((x, y) => (y.submittedAt ?? 0) - (x.submittedAt ?? 0));
    return `<div class="card">
      <div class="post-head"><b>📘 ${esc(a.title)}</b>
        <span class="badge">${esc(a.className ?? "")}</span>
        <span class="badge muted">max ${a.maxMarks ?? 10}</span>
        <span class="muted">due ${esc(a.dueDate ?? "—")} · ${mySubs.length} submission(s)</span></div>
      ${mySubs.map((s) => `
        <div class="sub-row">
          <div><b>${esc(s.studentName)}</b> <span class="muted">${timeAgo(s.submittedAt)}</span>
            ${s.text ? `<p>${esc(s.text)}</p>` : ""}
            ${s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noopener">🔗 submission link</a>` : ""}
            ${typeof s.marksGiven === "number"
              ? `<span class="badge green">✔ ${s.marksGiven}/${s.marksMax ?? a.maxMarks}</span> <span class="muted">${esc(s.feedback ?? "")}</span>`
              : `<span class="badge orange">not marked</span>`}
          </div>
          ${typeof s.marksGiven !== "number" ? `
            <div class="add-topic">
              <input class="js-marks" data-id="${s.id}" data-max="${a.maxMarks ?? 10}" type="number" min="0" max="${a.maxMarks ?? 10}" placeholder="Marks" style="max-width:90px">
              <input class="js-feedback" data-id="${s.id}" placeholder="Feedback" style="flex:1">
              <button class="btn btn-primary js-save-marks" data-id="${s.id}" data-uid="${s.studentUid}" data-max="${a.maxMarks ?? 10}" type="button">💾 Save</button>
            </div>` : ""}
        </div>`).join("") || `<p class="muted">No submissions yet.</p>`}
    </div>`;
  }).join("") || `<p class="muted">No assignments yet — create one above.</p>`;

  box.querySelectorAll(".js-save-marks").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const el = b as HTMLElement;
      const row = el.closest(".add-topic")!;
      const marksGiven = Number((row.querySelector(".js-marks") as HTMLInputElement).value);
      const max = Number(el.dataset.max);
      const feedback = (row.querySelector(".js-feedback") as HTMLInputElement).value.trim();
      if (Number.isNaN(marksGiven) || marksGiven < 0 || marksGiven > max) {
        showToast(`Marks must be 0–${max}`, "error"); return;
      }
      await dbUpdate("submissions", el.dataset.id!, { marksGiven, marksMax: max, feedback, markedBy: state.profile?.name });
      await recomputeAirScore(el.dataset.uid!, "assignment marked");
      await audit("submission_marked", el.dataset.id! + " → " + marksGiven + "/" + max);
      showToast("Marks saved — student's Air Score updated ⚡");
    })()));
}