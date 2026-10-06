import { dbUpdate, dbWatch } from "../store";
import { esc, showToast, timeAgo } from "../helpers";
import { notifyUser } from "../notify";
import type { QuizRequest } from "../types";

export function render(root: HTMLElement): void {
  root.innerHTML = `<h3>🧩 Quiz approvals (engagement checks)</h3><div id="qa-list" class="stack"><p class="muted">Loading…</p></div>
    <h3>✅ Completed quizzes</h3><div id="qa-done" class="stack"><p class="muted">—</p></div>`;
  const list = root.querySelector("#qa-list") as HTMLElement;
  const done = root.querySelector("#qa-done") as HTMLElement;
  let pending: QuizRequest[] = [];

  dbWatch<QuizRequest>("quizRequests", { where: [["status", "==", "pending"]], limit: 40 }, (rows) => {
    pending = rows.sort((a, b) => a.createdAt - b.createdAt);
    list.innerHTML = pending.length
      ? pending.map((q) => `<div class="card">
          <div><b>${esc(q.studentName)}</b> · ${esc(q.subject)} · <span class="muted small">${timeAgo(q.createdAt)}</span></div>
          <p class="muted small">Topic: <b>${esc(q.topic)}</b> — flagged by hardware (prolonged disengagement)</p>
          <ol class="small">${q.questions.map((x) => `<li>${esc(x.question)}</li>`).join("")}</ol>
          <div class="feed-actions">
            <button class="btn btn-primary" data-ok="${q.id}" type="button">✅ Approve & send</button>
            <button class="btn btn-ghost" data-no="${q.id}" type="button">✖ Reject</button>
          </div></div>`).join("")
      : `<p class="muted">🎉 Nothing pending.</p>`;
  });

  dbWatch<QuizRequest>("quizRequests", { where: [["status", "==", "completed"]], limit: 15 }, (rows) => {
    done.innerHTML = rows.sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0))
      .map((q) => `<div class="card small-card"><b>${esc(q.studentName)}</b> — ${esc(q.topic)}: <b>${q.score ?? 0}/${q.total ?? q.questions.length}</b> <span class="muted small">${timeAgo(q.completedAt ?? q.createdAt)}</span></div>`).join("")
      || `<p class="muted">None yet.</p>`;
  });

  list.onclick = async (e) => {
    const ok = (e.target as HTMLElement).closest("button[data-ok]") as HTMLElement | null;
    const no = (e.target as HTMLElement).closest("button[data-no]") as HTMLElement | null;
    if (ok) {
      const q = pending.find((x) => x.id === ok.dataset.ok);
      await dbUpdate("quizRequests", ok.dataset.ok!, { status: "sent", approvedAt: Date.now() });
      if (q) await notifyUser(q.studentUid, "🧩 New quiz assigned", `Topic: ${q.topic} — it will pop up automatically`, "quiz");
      showToast("Quiz sent — student's screen will pop it ✅");
    } else if (no) {
      await dbUpdate("quizRequests", no.dataset.no!, { status: "rejected" });
      showToast("Rejected");
    }
  };
}
