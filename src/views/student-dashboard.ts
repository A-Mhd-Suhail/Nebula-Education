import { state } from "../state";
import { dbList, dbWatch } from "../store";
import { esc, showToast, todayStr, timeAgo } from "../helpers";
import { classLabel } from "../catalog";
import { submitQuizRequest } from "../quiz";
import type { Assignment, Attendance, BoardImage, ClassSession, QuizRequest } from "../types";

export function render(root: HTMLElement): void {
  const me = state.profile!;
  root.innerHTML = `
    <div class="card"><h2>👋 Hi ${esc(me.name)}!</h2>
      <p class="muted small">${classLabel(me.className)} · AIR score <b>${me.airScore ?? 0}</b> · behavior <b>${me.behaviorScore ?? 100}</b></p></div>
    <div id="sd-live"></div>
    <div class="grid3" id="sd-stats"><div class="card stat"><h3>…</h3><p class="muted">Loading</p></div></div>
    <div class="card"><h3>📌 Homework due soon</h3><div id="sd-hw" class="stack"><p class="muted">Loading…</p></div></div>
    <div class="card"><h3>🖼 Latest board snapshot</h3><div id="sd-board"><p class="muted">Loading…</p></div></div>`;
  const live = root.querySelector("#sd-live") as HTMLElement;
  const stats = root.querySelector("#sd-stats") as HTMLElement;
  const hw = root.querySelector("#sd-hw") as HTMLElement;
  const board = root.querySelector("#sd-board") as HTMLElement;

  dbWatch<ClassSession>("sessions", { where: [["className", "==", me.className ?? ""]], limit: 5 }, (rows) => {
    const s = rows.filter((r) => r.active).sort((a, b) => b.startedAt - a.startedAt)[0];
    live.innerHTML = s
      ? `<div class="card live-card"><h3>🔴 LIVE NOW</h3><p><b>${esc(s.subject)}</b> with ${esc(s.teacherName)} · started ${timeAgo(s.startedAt)}</p></div>`
      : `<div class="card muted small">No live class right now — check your timetable.</div>`;
  });

  void (async () => {
    const today = todayStr();
    const att = await dbList<Attendance>("attendance", { where: [["uid", "==", me.uid]], limit: 400 });
    const todayAtt = att.find((a) => a.date === today);
    const dates = new Set(att.map((a) => a.date));
    const present = new Set(att.filter((a) => a.status === "present").map((a) => a.date));
    const pct = dates.size ? Math.round(present.size / dates.size * 100) : 0;
    stats.innerHTML = `
      <div class="card stat"><h3>${todayAtt?.status === "present" ? "✅ Present" : "⏳ Not marked"}</h3><p class="muted">Today</p></div>
      <div class="card stat"><h3>${pct}%</h3><p class="muted">Attendance</p></div>
      <div class="card stat"><h3>${me.airScore ?? 0}</h3><p class="muted">AIR score</p></div>`;
    const asg = await dbList<Assignment>("assignments", { limit: 60 });
    const mine = asg
      .filter((a) => !a.className || a.className === me.className)
      .filter((a) => !a.dueDate || a.dueDate >= today)
      .sort((a, b) => (a.dueDate ?? "").localeCompare(b.dueDate ?? "")).slice(0, 5);
    hw.innerHTML = mine.length
      ? mine.map((a) => `<div class="card small-card"><b>${esc(a.title)}</b> <span class="muted small">${esc(a.subject ?? "")} · due ${esc(a.dueDate ?? "—")}${a.maxMarks ? " · " + a.maxMarks + " marks" : ""}</span></div>`).join("")
      : `<p class="muted">Nothing due. 🎉</p>`;
  })().catch(() => {});

  dbWatch<BoardImage>("boardImages", { where: [["room", "==", me.className ?? ""]], limit: 4 }, (rows) => {
    const b = rows.sort((a, b2) => b2.capturedAt - a.capturedAt)[0];
    board.innerHTML = b
      ? `<img src="${esc(b.image)}" alt="board" style="max-width:100%;border-radius:8px"><p class="muted small">${timeAgo(b.capturedAt)}</p>`
      : `<p class="muted">No snapshots yet for ${esc(classLabel(me.className))}.</p>`;
  });
}

/* ============ LIVE QUIZ WATCHER (BUG #3) — pops teacher-approved quizzes ============ */
let quizWatcherStop: (() => void) | null = null;

export function watchStudentQuizzes(): void {
  const me = state.profile;
  if (!me || quizWatcherStop) return;
  quizWatcherStop = dbWatch<QuizRequest>(
    "quizRequests",
    { where: [["studentUid", "==", me.uid]], limit: 10 },
    (rows) => {
      const ready = rows
        .filter((q) => q.status === "sent")
        .sort((a, b) => (b.approvedAt ?? b.createdAt ?? 0) - (a.approvedAt ?? a.createdAt ?? 0));
      const next = ready.find((q) => {
        try { return !sessionStorage.getItem("quiz_seen_" + q.id); } catch { return true; }
      });
      if (next) {
        showToast("🧩 New quiz assigned — opening…");
        submitQuizRequest(next); // sets the seen-key itself → never double-pops
      }
    },
  );
}

export function stopStudentQuizzes(): void {
  quizWatcherStop?.();
  quizWatcherStop = null;
}
