import { state } from "../state";
import { dbAdd, dbUpdate, dbWatch } from "../store";
import { notifyUser } from "../notify";
import { recomputeTeacherScore } from "../airscore";
import { esc, showToast, timeAgo } from "../helpers";
import { SUBJECTS } from "../catalog";
import type { Doubt } from "../types";

export function render(root: HTMLElement): void {
  const me = state.profile!;

  if (me.role === "student") {
    root.innerHTML = `
      <div class="card"><h3>🙋 Ask a doubt</h3>
        <label>Subject <select id="d-subject">${SUBJECTS.map((s) => `<option>${s.id}</option>`).join("")}</select></label>
        <textarea id="d-question" rows="3" maxlength="500" placeholder="What's confusing you? Be specific…"></textarea>
        <button id="d-ask" class="btn btn-primary" type="button" style="margin-top:8px">Send to all teachers</button>
      </div>
      <h3>My doubts</h3><div id="d-mylist" class="stack"></div>`;

    (root.querySelector("#d-ask") as HTMLButtonElement).onclick = () => {
      const subject = (root.querySelector("#d-subject") as HTMLSelectElement).value;
      const question = (root.querySelector("#d-question") as HTMLTextAreaElement).value.trim();
      if (question.length < 5) { showToast("Please describe your doubt", "error"); return; }
      void dbAdd("doubts", { studentUid: me.uid, studentName: me.name, subject, question, status: "open", createdAt: Date.now() });
      (root.querySelector("#d-question") as HTMLTextAreaElement).value = "";
      showToast("Doubt sent — all teachers notified 🔔");
    };

    const my = root.querySelector("#d-mylist") as HTMLElement;
    dbWatch<Doubt>("doubts", { where: [["studentUid", "==", me.uid]], limit: 40 }, (rows) => {
      const list = rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
      my.innerHTML = list.length
        ? list.map((d) => `
          <div class="card ${d.status === "solved" ? "doubt-solved" : ""}">
            <div><b>${esc(d.subject)}</b> · <span class="muted small">${timeAgo(d.createdAt)}</span>
              ${d.status === "solved" ? `<span class="badge">SOLVED ✅</span>` : `<span class="badge">OPEN</span>`}</div>
            <p>${esc(d.question)}</p>
            ${d.status === "solved"
              ? `<div class="answer"><b>✅ ${esc(d.answeredBy ?? "Teacher")}:</b> ${esc(d.answer ?? "")}</div>`
              : `<p class="muted small">Waiting for a teacher to answer…</p>`}
          </div>`).join("")
        : `<p class="muted">No doubts yet.</p>`;
    });
    return;
  }

  /* teacher / staff side */
  root.innerHTML = `
    <h3>🎯 Open doubts (live — any teacher can solve)</h3><div id="d-open" class="stack"></div>
    <h3>✅ Recently solved</h3><div id="d-solved" class="stack"></div>`;
  const open = root.querySelector("#d-open") as HTMLElement;
  const solved = root.querySelector("#d-solved") as HTMLElement;

  dbWatch<Doubt>("doubts", { where: [["status", "==", "open"]], limit: 60 }, (rows) => {
    const list = rows.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0));
    open.innerHTML = list.length
      ? list.map((d) => `
        <div class="card">
          <div><b>${esc(d.studentName)}</b> · <b>${esc(d.subject)}</b> · <span class="muted small">${timeAgo(d.createdAt)}</span></div>
          <p>${esc(d.question)}</p>
          <textarea rows="2" data-ans="${d.id}" placeholder="Type your explanation…"></textarea>
          <button class="btn btn-primary" style="margin-top:6px" data-solve="${d.id}" data-uid="${d.studentUid}"
            data-q="${esc(d.question.slice(0, 60))}" type="button">Solve & send to student</button>
        </div>`).join("")
      : `<p class="muted">🎉 No open doubts right now.</p>`;
  });

  dbWatch<Doubt>("doubts", { where: [["status", "==", "solved"]], limit: 20 }, (rows) => {
    const list = rows.sort((a, b) => (b.answeredAt ?? b.createdAt ?? 0) - (a.answeredAt ?? a.createdAt ?? 0));
    solved.innerHTML = list.map((d) => `
      <div class="card doubt-solved">
        <div><b>${esc(d.studentName)}</b> · ${esc(d.subject)} ·
          <span class="muted small">${timeAgo(d.answeredAt ?? d.createdAt)}</span> · answered by <b>${esc(d.answeredBy ?? "—")}</b></div>
        <p>${esc(d.question)}</p><div class="answer">${esc(d.answer ?? "")}</div>
      </div>`).join("") || `<p class="muted">Nothing solved yet.</p>`;
  });

  open.onclick = async (e) => {
    const btn = (e.target as HTMLElement).closest("button[data-solve]") as HTMLElement | null;
    if (!btn) return;
    const id = btn.dataset.solve!;
    const ta = open.querySelector(`textarea[data-ans="${id}"]`) as HTMLTextAreaElement;
    const answer = ta.value.trim();
    if (answer.length < 2) { showToast("Write the answer first", "error"); return; }
    await dbUpdate("doubts", id, { status: "solved", answer, answeredBy: me.name, answeredByUid: me.uid, answeredAt: Date.now() });
    await notifyUser(btn.dataset.uid!, "✅ Your doubt was solved",
      `"${btn.dataset.q}…" — answer from ${me.name}`, "doubt");
    void recomputeTeacherScore(me.uid, "doubt solved"); // BUG #4b trigger
    showToast("Answer sent to student ✅");
  };
}
