import { addViewListener } from "../router";
import { state } from "../state";
import { dbUpdate, dbWatch } from "../store";
import { $, esc, showToast } from "../helpers";
import type { QuizRequest } from "../types";

let requests: QuizRequest[] = [];

export function renderQuizApprovals(): void {
  const root = $("#approvals-root");
  root.innerHTML = `<div class="card"><h3>🧪 Quiz Approvals</h3><p class="muted">Review AI-generated quizzes before sending them to students.</p></div><div id="approval-list"><div class="loading">Loading…</div></div>`;
  const unsub = dbWatch<QuizRequest>("quizRequests", { limit: 100 }, (rows) => {
    requests = rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    paint();
  });
  addViewListener(unsub);
}

function paint(): void {
  const box = $("#approval-list");
  const pending = requests.filter((r) => r.status === "pending");
  box.innerHTML = pending.map((r) => `<div class="card approval-card"><div class="post-head"><b>${esc(r.studentName)}</b><span class="badge">${esc(r.subject)}</span><span class="muted">${esc(r.topic)}</span></div><ol>${r.questions.map((q) => `<li><b>${esc(q.question)}</b><div class="muted">${q.options.map(esc).join(" · ")}</div></li>`).join("")}</ol><div class="quick-row"><button class="btn btn-primary js-approve" data-id="${r.id}" type="button">✅ Approve & send</button><button class="btn js-reject" data-id="${r.id}" type="button">✕ Reject</button></div></div>`).join("") || `<p class="muted">No quizzes waiting for approval.</p>`;
  box.querySelectorAll<HTMLButtonElement>(".js-approve").forEach((b) => b.addEventListener("click", () => void update(b.dataset.id!, "sent", "Quiz approved and sent ✅")));
  box.querySelectorAll<HTMLButtonElement>(".js-reject").forEach((b) => b.addEventListener("click", () => void update(b.dataset.id!, "rejected", "Quiz rejected")));
}

async function update(id: string, status: "sent" | "rejected", message: string): Promise<void> {
  await dbUpdate("quizRequests", id, { status, approvedAt: Date.now(), approvedBy: state.profile?.uid ?? "" });
  showToast(message);
}
