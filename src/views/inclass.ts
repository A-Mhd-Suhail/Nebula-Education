--------------------------------------------------------------------------------
import { state } from "../state";
import { dbWatch } from "../store";
import { esc, showToast, timeAgo } from "../helpers";
import { submitQuizRequest } from "../quiz";
import type { BoardImage, ClassSession, ContentItem, QuizRequest } from "../types";

export function render(root: HTMLElement): void {
  const me = state.profile!;
  root.innerHTML = `
    <div class="card"><h3>🏫 In Class — ${esc(me.name)}</h3><div id="ic-live"><p class="muted">Checking for a live session…</p></div></div>
    <div id="ic-main" class="hidden">
      <div class="grid2">
        <div class="card"><h3>🖼 Board (live)</h3><div id="ic-board"><p class="muted">Waiting for snapshots…</p></div></div>
        <div class="card"><h3>📝 Notes & quizzes from teacher</h3><div id="ic-notes" class="stack"><p class="muted">—</p></div></div>
      </div>
      <div class="card"><h3>⚡ My check-quizzes</h3><div id="ic-quiz"><p class="muted">—</p></div></div>
    </div>`;
  const liveEl = root.querySelector("#ic-live") as HTMLElement;
  const mainEl = root.querySelector("#ic-main") as HTMLElement;
  let sid = "";
  let stopBoard: (() => void) | null = null;
  let stopNotes: (() => void) | null = null;
  let sentReqs: QuizRequest[] = [];

  dbWatch<ClassSession>("sessions", { where: [["className", "==", me.className ?? ""]], limit: 5 }, (rows) => {
    const s = rows.filter((r) => r.active).sort((a, b) => b.startedAt - a.startedAt)[0];
    if (!s) { liveEl.innerHTML = `<p class="muted">No live session for your class right now.</p>`; mainEl.classList.add("hidden"); sid = ""; return; }
    sid = s.id;
    liveEl.innerHTML = `<p>🔴 <b>${esc(s.subject)}</b> with ${esc(s.teacherName)} · live since ${timeAgo(s.startedAt)}</p>`;
    mainEl.classList.remove("hidden");
    watchSession();
  });

  function watchSession(): void {
    stopBoard?.(); stopNotes?.();
    if (!sid) return;
    stopBoard = dbWatch<BoardImage>("boardImages", { where: [["room", "==", me.className ?? ""]], limit: 4 }, (rows) => {
      const el = root.querySelector("#ic-board") as HTMLElement;
      const list = rows.sort((a, b) => b.capturedAt - a.capturedAt).slice(0, 2);
      el.innerHTML = list.map((b) => `<img src="${esc(b.image)}" style="max-width:100%;border-radius:8px;margin-bottom:6px" alt="board"><p class="muted small">${timeAgo(b.capturedAt)}</p>`).join("") || `<p class="muted">No snapshots yet.</p>`;
    });
    stopNotes = dbWatch<ContentItem>("contents", { where: [["sessionId", "==", sid]], limit: 40 }, (rows) => {
      const el = root.querySelector("#ic-notes") as HTMLElement;
      const list = rows.sort((a, b) => b.createdAt - a.createdAt);
      el.innerHTML = list.length
        ? list.map((c) => `<div class="card small-card"><b>${c.type === "note" ? "📝 Note" : c.type === "video" ? "🎬 Video" : "🧩 Quiz"}</b> <span class="muted small">${timeAgo(c.createdAt)}</span><p>${esc(c.text)}</p>${c.quiz ? `<p class="muted small">Q: ${esc(c.quiz.question)}</p>` : ""}</div>`).join("")
        : `<p class="muted">No content posted yet.</p>`;
    });
  }

  dbWatch<QuizRequest>("quizRequests", { where: [["studentUid", "==", me.uid]], limit: 10 }, (rows) => {
    const el = root.querySelector("#ic-quiz") as HTMLElement;
    const list = rows.sort((a, b) => b.createdAt - a.createdAt);
    sentReqs = list.filter((q) => q.status === "sent");
    el.innerHTML = list.length
      ? list.map((q) => `<div class="card small-card"><b>${esc(q.topic)}</b> · ${esc(q.subject)} <span class="badge">${esc(q.status)}</span> <span class="muted small">${timeAgo(q.createdAt)}</span>
        ${q.status === "completed" ? `<p class="muted small">Score: ${q.score ?? 0}/${q.total ?? q.questions.length}</p>`
          : q.status === "pending" ? `<p class="muted small">Waiting for teacher approval…</p>`
          : q.status === "sent" ? `<button class="btn btn-primary" data-take="${q.id}" type="button">⚡ Take quiz</button>`
          : `<p class="muted small">Not approved.</p>`}</div>`).join("")
      : `<p class="muted">No check-quizzes yet. Stay engaged! 🙂</p>`;
  });

  root.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button[data-take]") as HTMLElement | null;
    if (!b) return;
    const q = sentReqs.find((x) => x.id === b.dataset.take);
    if (q) { submitQuizRequest(q); } else { showToast("Quiz not found", "error"); }
  });
}

