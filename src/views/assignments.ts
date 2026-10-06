--------------------------------------------------------------------------------
import { state } from "../state";
import { dbAdd, dbUpdate, dbWatch } from "../store";
import { esc, showToast, timeAgo } from "../helpers";
import { CLASS_LIST, createSearchableSelect, getSelectValue } from "../catalog";
import { notifyUsers } from "../notify";
import type { Assignment, Submission, UserProfile } from "../types";

export function render(root: HTMLElement): void {
  const me = state.profile!;

  if (me.role === "teacher") {
    root.innerHTML = `
      <div class="card"><h3>📚 Create assignment</h3>
        <input id="as-title" placeholder="Title" />
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          <input id="as-due" type="date" style="max-width:180px" />
          <input id="as-marks" type="number" min="1" placeholder="Max marks" style="max-width:120px" />
        </div>
        <div id="as-class-slot" style="margin-top:8px"></div>
        <button id="as-create" class="btn btn-primary" style="margin-top:8px" type="button">Create</button></div>
      <h3>📥 Submissions to grade</h3><div id="as-subs" class="stack"><p class="muted">Loading…</p></div>`;
    (root.querySelector("#as-class-slot") as HTMLElement).appendChild(createSearchableSelect("as-class", CLASS_LIST, "🔍 Choose class…"));

    (root.querySelector("#as-create") as HTMLButtonElement).onclick = async () => {
      const title = (root.querySelector("#as-title") as HTMLInputElement).value.trim();
      const dueDate = (root.querySelector("#as-due") as HTMLInputElement).value;
      const maxMarks = Number((root.querySelector("#as-marks") as HTMLInputElement).value) || 10;
      const className = getSelectValue("as-class");
      if (!title || !className) { showToast("Title + class required", "error"); return; }
      await dbAdd("assignments", { title, dueDate, subject: me.subject ?? "", className, by: me.name, teacherUid: me.uid, maxMarks, createdAt: Date.now() });
      try {
        const students = await dbList<UserProfile>("users", { where: [["role", "==", "student"]], limit: 500 });
        await notifyUsers(students.filter((s) => s.className === className).map((s) => s.uid), "📚 New assignment", title);
      } catch { /* non-fatal */ }
      (root.querySelector("#as-title") as HTMLInputElement).value = "";
      showToast("Assignment created ✅");
    };

    const subsEl = root.querySelector("#as-subs") as HTMLElement;
    let myAsg: Assignment[] = [];
    let subCache: Submission[] = [];
    dbWatch<Assignment>("assignments", { limit: 50 }, (rows) => { myAsg = rows.filter((a) => a.teacherUid === me.uid); paintSubs(); });
    dbWatch<Submission>("submissions", { limit: 120 }, (rows) => { subCache = rows; paintSubs(); });
    function paintSubs(): void {
      const list = subCache.filter((s) => myAsg.some((a) => a.id === s.assignmentId) && typeof s.marksGiven !== "number");
      subsEl.innerHTML = list.length
        ? list.map((s) => `<div class="card small-card"><b>${esc(s.studentName)}</b> — ${esc(s.assignmentTitle ?? "")} <span class="muted small">${timeAgo(s.submittedAt)}</span>
          ${s.text ? `<p>${esc(s.text)}</p>` : ""}${s.link ? `<a href="${esc(s.link)}" target="_blank" rel="noopener">${esc(s.link)}</a>` : ""}
          <div class="feed-actions"><input type="number" data-mk="${s.id}" placeholder="Marks" /><button class="btn btn-primary" data-grade="${s.id}" type="button">Grade</button></div></div>`).join("")
        : `<p class="muted">Nothing to grade 🎉</p>`;
    }
    subsEl.onclick = async (e) => {
      const g = (e.target as HTMLElement).closest("button[data-grade]") as HTMLElement | null;
      if (!g) return;
      const id = g.dataset.grade!;
      const val = Number((subsEl.querySelector(`input[data-mk="${id}"]`) as HTMLInputElement).value);
      if (Number.isNaN(val)) { showToast("Enter marks", "error"); return; }
      await dbUpdate("submissions", id, { marksGiven: val, markedBy: me.name });
      showToast("Graded ✅");
    };
    return;
  }

  /* student */
  root.innerHTML = `<h3>📚 Assignments</h3><div id="as-list" class="stack"><p class="muted">Loading…</p></div>`;
  const listEl = root.querySelector("#as-list") as HTMLElement;
  let subs: Submission[] = [];
  let allAsg: Assignment[] = [];
  dbWatch<Submission>("submissions", { where: [["studentUid", "==", me.uid]], limit: 50 }, (rows) => { subs = rows; });
  dbWatch<Assignment>("assignments", { limit: 50 }, (rows) => {
    allAsg = rows;
    const mine = rows.filter((a) => !a.className || a.className === me.className).sort((a, b) => b.createdAt - a.createdAt);
    listEl.innerHTML = mine.length
      ? mine.map((a) => {
          const s = subs.find((x) => x.assignmentId === a.id);
          return `<div class="card">
            <div><b>${esc(a.title)}</b> <span class="muted small">${esc(a.subject ?? "")} · due ${esc(a.dueDate ?? "—")} · max ${a.maxMarks ?? "?"} marks</span></div>
            ${s ? `<p class="muted small">Submitted ${timeAgo(s.submittedAt)}${typeof s.marksGiven === "number" ? ` · Grade: <b>${s.marksGiven}/${s.marksMax ?? a.maxMarks ?? 10}</b>${s.feedback ? " — " + esc(s.feedback) : ""}` : " · awaiting grade"}</p>`
              : `<textarea rows="2" data-sub="${a.id}" placeholder="Your answer / notes"></textarea>
                 <input data-link="${a.id}" placeholder="Link (optional)" style="margin-top:6px" />
                 <button class="btn btn-primary" style="margin-top:6px" data-send="${a.id}" type="button">Submit</button>`}
          </div>`;
        }).join("")
      : `<p class="muted">No assignments yet.</p>`;
  });
  listEl.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest("button[data-send]") as HTMLElement | null;
    if (!b) return;
    const id = b.dataset.send!;
    const text = (listEl.querySelector(`textarea[data-sub="${id}"]`) as HTMLTextAreaElement).value.trim();
    const link = (listEl.querySelector(`input[data-link="${id}"]`) as HTMLInputElement).value.trim();
    if (!text && !link) { showToast("Write your answer or add a link", "error"); return; }
    const asg = allAsg.find((x) => x.id === id);
    await dbAdd("submissions", { assignmentId: id, assignmentTitle: asg?.title ?? "", marksMax: asg?.maxMarks, studentUid: me.uid, studentName: me.name, text, link, submittedAt: Date.now() });
    showToast("Submitted ✅");
  };
}

