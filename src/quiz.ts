import { recomputeAirScore } from "./airscore";
import { addDoc, collection, doc, getDocs, increment, updateDoc } from "firebase/firestore";
import { db } from "./firebase";
import { state } from "./state";
import { $, $$, esc, showToast } from "./helpers";
import type { Quiz } from "./types";

const FALLBACK: Quiz[] = [
  { id: "d1", subject: "General", question: "What does CPU stand for?",
    options: ["Central Process Unit", "Central Processing Unit", "Computer Personal Unit", "Central Program Unit"], correctIndex: 1 },
  { id: "d2", subject: "General", question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Mercury"], correctIndex: 1 },
  { id: "d3", subject: "Mathematics", question: "What is 12 × 8?",
    options: ["86", "96", "108", "92"], correctIndex: 1 },
];

let cache: Quiz[] | null = null;

export async function getQuizzes(): Promise<Quiz[]> {
  if (cache) return cache;
  try {
    const snap = await getDocs(collection(db, "quizzes"));
    const list = snap.docs.map((d) => ({ id: d.id, ...d.data() }) as Quiz);
    cache = list.length ? list : FALLBACK;
  } catch {
    cache = FALLBACK;
  }
  return cache ?? FALLBACK;
}

export interface QuizModalOpts {
  timeLimitSec?: number;
  onComplete?: (correct: boolean, points: number) => void;
}

interface CurState {
  quiz: Quiz; points: number; exam: string; sessionId: string; selected: number;
  opts: QuizModalOpts; timeLeft: number; timerId: number | undefined; metaBase: string;
}

let cur: CurState | null = null;

function stopTimer(): void {
  if (cur?.timerId) { window.clearInterval(cur.timerId); cur.timerId = undefined; }
}

export function showQuizModal(quiz: Quiz, points: number, exam: string, sessionId = "", opts: QuizModalOpts = {}): void {
  stopTimer();
  cur = {
    quiz, points, exam, sessionId, selected: -1, opts,
    timeLeft: opts.timeLimitSec ?? 0, timerId: undefined,
    metaBase: `${exam} · +${points} Air Score for a correct answer`,
  };
  $("#quiz-meta").textContent = cur.metaBase + (opts.timeLimitSec ? ` · ⏱ ${opts.timeLimitSec}s left` : "");
  $("#quiz-question").textContent = quiz.question;
  $("#quiz-options").innerHTML = quiz.options
    .map((o, i) => `<button class="opt" data-i="${i}" type="button">${esc(o)}</button>`).join("");
  $("#quiz-close").classList.toggle("hidden", !!opts.timeLimitSec);
  $("#quiz-modal").classList.remove("hidden");

  if (opts.timeLimitSec) {
    cur.timerId = window.setInterval(() => {
      if (!cur) return;
      cur.timeLeft--;
      $("#quiz-meta").textContent = cur.metaBase + ` · ⏱ ${cur.timeLeft}s left`;
      if (cur.timeLeft <= 0) { showToast("⏰ Time up!", "error"); submitAnswer(); }
    }, 1000);
  }
}

function submitAnswer(): void {
  if (!cur) return;
  const { quiz, points, exam, sessionId, selected, opts } = cur;
  stopTimer();
  const correct = selected === quiz.correctIndex;
  cur = null;
  $("#quiz-modal").classList.add("hidden");
  const gained = correct ? points : 1;
  void (async () => {
    try {
      if (state.profile) {
        await updateDoc(doc(db, "users", state.profile.uid), { airScore: increment(gained) });
        state.profile.airScore = (state.profile.airScore ?? 0) + gained;
        await addDoc(collection(db, "marks"), {
          studentUid: state.profile.uid, studentName: state.profile.name,
          sessionId, subject: quiz.subject ?? "General", exam,
          score: correct ? 1 : 0, total: 1, createdAt: Date.now(),
        });
        void recomputeAirScore(state.profile.uid, "quiz: " + exam);
      }
    } catch (err) { console.error(err); }
    showToast(correct ? `✅ Correct! +${gained}` : `❌ Wrong — +${gained} for participation`, correct ? "success" : "error");
    opts.onComplete?.(correct, gained);
  })();
}

export function initQuizModal(): void {
  $("#quiz-options").addEventListener("click", (e: Event) => {
    const btn = (e.target as HTMLElement).closest(".opt") as HTMLElement | null;
    if (!btn || !cur) return;
    $$("#quiz-options .opt").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    cur.selected = Number(btn.dataset.i);
  });
  $("#quiz-close").addEventListener("click", () => { stopTimer(); $("#quiz-modal").classList.add("hidden"); cur = null; });
  $("#quiz-submit").addEventListener("click", () => {
    if (!cur) return;
    if (cur.selected < 0) { showToast("Select an answer first", "error"); return; }
    submitAnswer();
  });
}