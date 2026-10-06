import { state } from "../state";
import { dbSet, dbWatch } from "../store";
import { esc, showToast, timeAgo } from "../helpers";
import { submitQuizRequest } from "../quiz";
import { recomputeTeacherScore } from "../airscore";
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
  let currentSession: ClassSession | null = null;
  let myRating = 0;
  let stopBoard: (() => void) | null = null;
  let stopNotes: (() => void) | null = null;

  dbWatch<ClassSession>("sessions", { where: [["className", "==", me.className ?? ""]], limit: 5 }, (rows) => {
    const s = rows.filter((r) => r.active).sort((a, b) => b.startedAt - a.startedAt)[0];
    if (!s) {
      liveEl.innerHTML = `<p class="muted">No live session for your class right now.</p>`;
      mainEl.classList.add("hidden"); sid = ""; currentSession = null; return;
    }
    sid = s.id; currentSession = s;
    liveEl.innerHTML = `
      <p>🔴 <b>${esc(s.subject)}</b> with ${esc(s.teacherName)} · live since ${timeAgo(s.startedAt)}</p>
      <div style="margin-top:8px"><b>Rate this class</b> <span class="muted small">(one rating per session — you can update it)</span>
        <div id="ic-stars" class="feed-actions">
          ${[1, 2, 3, 4, 5].map((i) => `<button class="btn" data-star="${i}" type="button" aria-label="${i} star${i > 1 ? "s" : ""}">☆</button>`).join("")}
        </div>
        <input id="ic-comment" maxlength="200" placeholder="Optional comment…" />
        <button id="ic-rate-send" class="btn btn-primary" style="margin-top:6px" type="button">Submit rating</button>
      </div>`;
    mainEl.classList.remove("hidden");
    paintStars();
    (liveEl.querySelector("#ic-rate-send") as HTMLButtonElement).onclick = () => void sendRating();
  });

  function paintStars(): void {
    liveEl.querySelectorAll<HTMLButtonElement>("#ic-stars button").forEach((b) => {
      const i = Number(b.dataset.star);
      b.textContent = i <= myRating ? "★" : "☆";
      b.classList.toggle("star-on", i <= myRating);
    });
  }
  liveEl.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button[data-star]") as HTMLElement | null;
    if (!b) return;
    myRating = Number(b.dataset.star);
    paintStars();
  });

  async function sendRating(): Promise<void> {
    if (!currentSession) { showToast("No live session", "error"); return; }
    if (!myRating) { showToast("Pick 1–5 stars first", "error"); return; }
    const comment = (liveEl.querySelector("#ic-comment") as HTMLInputElement).value.trim();
    // BUG #7: deterministic doc-id → one rating per student per session (overwrite, never spam)
    await dbSet("ratings", `${sid}_${me.uid}`, {
      teacherUid: currentSession.teacherUid, teacherName: currentSession.teacherName,
      studentUid: me.uid, studentName: me.name, sessionId: sid,
      stars: myRating, comment, createdAt: Date.now(),
    });
    void recomputeTeacherScore(currentSession.teacherUid, "new rating"); // BUG #4b trigger
    showToast("Thanks for rating ⭐");
  }

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

  let sentReqs: QuizRequest[] = [];
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
