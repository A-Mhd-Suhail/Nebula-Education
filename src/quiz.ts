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

let cur: { quiz: Quiz; points: number; exam: string; sessionId: string; selected: number } | null = null;

export function showQuizModal(quiz: Quiz, points: number, exam: string, sessionId = ""): void {
  cur = { quiz, points, exam, sessionId, selected: -1 };
  $("#quiz-meta").textContent = `${exam} · +${points} Air Score for a correct answer`;
  $("#quiz-question").textContent = quiz.question;
  $("#quiz-options").innerHTML = quiz.options
    .map((o, i) => `<button class="opt" data-i="${i}" type="button">${esc(o)}</button>`)
    .join("");
  $("#quiz-modal").classList.remove("hidden");
}

export function initQuizModal(): void {
  $("#quiz-options").addEventListener("click", (e: Event) => {
    const btn = (e.target as HTMLElement).closest(".opt") as HTMLElement | null;
    if (!btn || !cur) return;
    $$("#quiz-options .opt").forEach((b) => b.classList.remove("selected"));
    btn.classList.add("selected");
    cur.selected = Number(btn.dataset.i);
  });

  $("#quiz-close").addEventListener("click", () => {
    $("#quiz-modal").classList.add("hidden");
    cur = null;
  });

  $("#quiz-submit").addEventListener("click", () => {
    if (!cur) return;
    if (cur.selected < 0) { showToast("Select an answer first", "error"); return; }
    const { quiz, points, exam, sessionId, selected } = cur;
    const correct = selected === quiz.correctIndex;
    cur = null;
    $("#quiz-modal").classList.add("hidden");
    void (async () => {
      const gained = correct ? points : 1;
      try {
        if (state.profile) {
          await updateDoc(doc(db, "users", state.profile.uid), { airScore: increment(gained) });
          state.profile.airScore = (state.profile.airScore ?? 0) + gained;
          await addDoc(collection(db, "marks"), {
            studentUid: state.profile.uid, studentName: state.profile.name,
            sessionId, subject: quiz.subject ?? "General", exam,
            score: correct ? 1 : 0, total: 1, createdAt: Date.now(),
          });
        }
      } catch (err) { console.error(err); }
      showToast(
        correct ? `✅ Correct! +${gained} Air Score` : `❌ Wrong — +${gained} for participation`,
        correct ? "success" : "error");
    })();
  });
}