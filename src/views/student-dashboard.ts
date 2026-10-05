import { recomputeAirScore } from "../airscore";
import { showQuizModal } from "../quiz";
import { addViewListener } from "../router";
import { state } from "../state";
import { dbList, dbUpdate, dbWatch } from "../store";
import { $, esc, showToast } from "../helpers";
import type { Attendance, BoardImage, ClassSession, Incident, Quiz, QuizRequest } from "../types";

let quizUnsub: (() => void) | null = null;
let boardUnsub: (() => void) | null = null;
const activeReq = new Set<string>();
let lastBoardId = "";
let boardFirst = true;

/* ==== GLOBAL: pops the timed quiz the moment a teacher approves it ==== */
export function watchStudentQuizzes(): void {
  stopStudentQuizzes();
  const me = state.profile;
  if (!me || me.role !== "student") return;
  quizUnsub = dbWatch<QuizRequest>("quizRequests", { where: [["studentUid", "==", me.uid]] }, (list) => {
    const due = list.find((q) => q.status === "sent");
    if (due && !activeReq.has(due.id)) {
      activeReq.add(due.id);
      showToast("⚡ Quick Class Check received — answer now!", "error");
      void runQuizRequest(due);
    }
  });
}

export function stopStudentQuizzes(): void {
  if (quizUnsub) { try { quizUnsub(); } catch { /* noop */ } }
  quizUnsub = null;
  activeReq.clear();
  if (boardUnsub) { try { boardUnsub(); } catch { /* noop */ } }
  boardUnsub = null;
}

async function runQuizRequest(req: QuizRequest): Promise<void> {
  const total = req.questions.length;
  let i = 0;
  let score = 0;
  const next = (): void => {
    if (i >= total) {
      void dbUpdate("quizRequests", req.id, { status: "completed", score, total, completedAt: Date.now() });
      void recomputeAirScore(req.studentUid, "live quiz: " + req.topic);
      showToast(`📊 Live quiz "${req.topic}": ${score}/${total}`, score >= total / 2 ? "success" : "error");
      return;
    }
    const qd = req.questions[i]!;
    const q: Quiz = { id: req.id + "-" + i, question: qd.question, options: qd.options, correctIndex: qd.correctIndex, subject: req.subject };
    showQuizModal(q, 10, `Live Quiz ${i + 1}/${total}: ${req.topic}`, "", {
      timeLimitSec: 90,
      onComplete: (correct) => { if (correct) score++; i++; next(); },
    });
  };
  next();
}

/* ==== VIEW ==== */
export function renderStudentDashboard(): void {
  const me = state.profile;
  if (!me) return;
  const room = me.className ?? "";
  const root = $("#studentdash-root");
  root.innerHTML = `
    <div id="sd-live"></div>
    <div class="card">
      <h3>🏫 Live Classroom — ${esc(room || "no class set")}</h3>
      <div class="live-chips" id="sd-chips"><span class="chip muted">Loading…</span></div>
      <h4>📷 Latest board</h4>
      <div id="sd-board"><p class="muted">Waiting for board snapshots…</p></div>
      <h4>🔔 My notifications</h4>
      <div id="sd-notifs" class="alert-feed"><p class="muted">Loading…</p></div>
    </div>
    <div class="grid-2">
      <div class="card">
        <h3>📅 My Attendance Record</h3>
        <div class="cal-head"><span class="badge green">■ Present</span><span class="muted" id="sd-month"></span></div>
        <div class="cal-grid" id="sd-cal"></div>
      </div>
      <div class="card">
        <h3>🛡️ My Behavior & Disciplinary Log</h3>
        <div class="rating-summary">
          <div class="big-rating" id="sd-behavior">—</div>
          <div><span class="muted">Behavior Score<br>(flags reduce it — always human-reviewed)</span></div>
        </div>
        <div id="sd-incidents"></div>
      </div>
    </div>
    <div class="card">
      <h3>📊 My Performance — Live Quiz History</h3>
      <div id="sd-quizhist"><div class="loading">Loading…</div></div>
    </div>`;

  addViewListener(dbWatch<ClassSession>("sessions", { where: [["active", "==", true]] }, (rows) => {
    const s = rows.find((x) => x.className === room);
    const el = $("#sd-live");
    if (el) {
      el.innerHTML = s
        ? `<div class="live-banner">🔴 LIVE NOW — ${esc(s.subject)} with ${esc(s.teacherName)} · open <b>In Class</b> to connect your Tab</div>`
        : `<p class="muted" style="margin-bottom:14px">No live class right now.</p>`;
    }
  }));

  addViewListener(dbWatch<QuizRequest>("quizRequests", { where: [["studentUid", "==", me.uid]] }, (rows) => {
    const waiting = rows.some((r) => r.status === "sent");
    const done = rows.filter((r) => r.status === "completed").sort((a, b) => (b.completedAt ?? 0) - (a.completedAt ?? 0));
    const hist = $("#sd-quizhist");
    if (hist) {
      hist.innerHTML = (waiting ? `<p class="hint">⚡ A Quick Class Check is on your screen — answer it!</p>` : "")
        + (done.map((r) => `
          <div class="profile-row">
            <span>${esc(r.topic)} <span class="badge">${esc(r.subject)}</span></span>
            <b>${r.score ?? 0}/${r.total ?? r.questions.length} <span class="muted">· ${new Date(r.completedAt ?? r.createdAt).toLocaleDateString()}</span></b>
          </div>`).join("") || `<p class="muted">No live quizzes yet. Stay attentive! 👀</p>`);
    }
  }));

  if (room) {
    boardUnsub = dbWatch<BoardImage>("boardImages", { where: [["room", "==", room]], limit: 10 }, (rows) => {
      rows.sort((a, b) => (b.capturedAt ?? 0) - (a.capturedAt ?? 0));
      const el = $("#sd-board");
      if (el) {
        const b = rows[0];
        el.innerHTML = b
          ? `<img class="board-img" src="${esc(b.image)}" alt="Board" style="max-width:100%;border-radius:10px">
             <div class="post-head"><span class="muted">${new Date(b.capturedAt).toLocaleTimeString()} · open <b>Board Notes</b> from teacher menu for history</span></div>`
          : `<p class="muted">Waiting for board snapshots…</p>`;
      }
      if (!boardFirst && rows[0] && rows[0].id !== lastBoardId) showToast("📸 New board notes!");
      lastBoardId = rows[0]?.id ?? "";
      boardFirst = false;
    });
  }

  void (async () => {
    const [incidents, att] = await Promise.all([
      dbList<Incident>("incidents"),
      dbList<Attendance>("attendance", { where: [["uid", "==", me.uid]] }),
    ]);
    const mine = incidents.filter((i) => i.involvedIds.includes(me.uid)).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const bEl = $("#sd-behavior");
    if (bEl) {
      const b = me.behaviorScore ?? 100;
      bEl.textContent = String(b);
      bEl.style.color = b >= 80 ? "#059669" : b >= 50 ? "#d97706" : "#dc2626";
    }
    const inc = $("#sd-incidents");
    if (inc) {
      inc.innerHTML = mine.map((i) => `
        <div class="profile-row"><span>${esc(i.type)} — ${esc(i.description)}</span>
        <span class="badge ${i.status === "reviewed" || i.status === "resolved" ? "green" : "orange"}">${esc(i.status)}</span></div>`).join("")
        || `<p class="muted">Clean record. Keep it up! 🌟</p>`;
    }
    const present = new Set(att.filter((r) => r.status === "present").map((r) => r.date));
    paintCal(present);
  })();
}

function paintCal(present: Set<string>): void {
  const grid = $("#sd-cal");
  const label = $("#sd-month");
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  if (label) label.textContent = now.toLocaleString("en", { month: "long" }) + " " + y;
  if (!grid) return;
  const startDow = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  let html = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < startDow; i++) html += `<div></div>`;
  for (let d = 1; d <= days; d++) {
    const iso = y + "-" + String(m + 1).padStart(2, "0") + "-" + String(d).padStart(2, "0");
    const isToday = iso === new Date().toISOString().slice(0, 10);
    html += `<div class="cal-day ${present.has(iso) ? "present" : ""} ${isToday ? "sel" : ""}" style="cursor:default">${d}</div>`;
  }
  grid.innerHTML = html;
}