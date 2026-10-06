--------------------------------------------------------------------------------
import { dbUpdate } from "./store";
import { $, esc, showToast } from "./helpers";
import { notifyRoles } from "./notify";
import type { QuizQuestion } from "./types";

/** Rule-based offline quiz generator (honest label in UI: "Rule-based quiz"). */
export function generateQuiz(topic: string, subject: string, n = 3): QuizQuestion[] {
  const t = topic.trim() || subject || "the lesson";
  const bank: QuizQuestion[] = [
    { question: `Which statement best describes "${t}"?`, options: [`The core idea of ${t}`, "An unrelated formula", "A classroom rule", "A school event"], correctIndex: 0 },
    { question: `Where is "${t}" most likely applied?`, options: [`Real-world ${subject.toLowerCase()} problems`, "Nowhere", "Only in fiction", "Only in exams"], correctIndex: 0 },
    { question: `Which is NOT related to "${t}"?`, options: ["A topic from a totally different subject", `${t} fundamentals`, `${t} examples`, `${t} practice`], correctIndex: 0 },
    { question: `Studying "${t}" mainly improves your…`, options: [`${subject} understanding`, "Typing speed", "Handwriting", "Attendance"], correctIndex: 0 },
    { question: `Pick the best first step to learn "${t}".`, options: ["Read the basics and examples", "Skip it", "Memorize random facts", "Wait for the exam"], correctIndex: 0 },
  ];
  return bank.slice(0, Math.max(1, n)).map((q) => {
    const opts = [...q.options];
    const correct = opts[q.correctIndex];
    for (let i = opts.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [opts[i], opts[j]] = [opts[j], opts[i]];
    }
    return { ...q, options: opts, correctIndex: opts.indexOf(correct) };
  });
}

/* ================= QUIZ MODAL (index.html #quiz-modal) ================= */
let current: { id: string; questions: QuizQuestion[]; i: number; answers: number[] } | null = null;

function paintQ(): void {
  if (!current) return;
  const q = current.questions[current.i];
  $("#quiz-question").textContent = `Q${current.i + 1}/${current.questions.length}: ${q.question}`;
  $("#quiz-options").innerHTML = q.options
    .map((o, i) => `<label class="quiz-opt"><input type="radio" name="qo" value="${i}" /> ${esc(o)}</label>`)
    .join("");
}

export function openQuizModal(req: { id: string; topic: string; subject: string; questions: QuizQuestion[]; studentName?: string }): void {
  current = { id: req.id, questions: req.questions, i: 0, answers: req.questions.map(() => -1) };
  $("#quiz-modal").classList.remove("hidden");
  $("#quiz-meta").textContent = `${req.subject} · ${req.topic}`;
  paintQ();
}

export function initQuizModal(onDone: (score: number, total: number) => void): void {
  $("#quiz-close").onclick = () => { $("#quiz-modal").classList.add("hidden"); current = null; };
  $("#quiz-submit").onclick = () => {
    if (!current) return;
    const sel = document.querySelector<HTMLInputElement>("input[name=qo]:checked");
    if (!sel) { showToast("Pick an answer", "error"); return; }
    current.answers[current.i] = Number(sel.value);
    if (current.i < current.questions.length - 1) { current.i++; paintQ(); return; }
    const score = current.answers.filter((a, i) => a === current!.questions[i].correctIndex).length;
    const total = current.questions.length;
    $("#quiz-modal").classList.add("hidden");
    current = null;
    onDone(score, total);
  };
}

/** Student takes a hardware-flagged engagement quiz. */
export function submitQuizRequest(req: { id: string; topic: string; subject: string; questions: QuizQuestion[]; studentName: string }): void {
  openQuizModal(req);
  initQuizModal(async (score, total) => {
    try {
      await dbUpdate("quizRequests", req.id, { status: "completed", score, total, completedAt: Date.now() });
      await notifyRoles(["teacher"], "🧩 Quiz completed", `${req.studentName} scored ${score}/${total} on "${req.topic}"`);
      showToast(`Quiz done: ${score}/${total} 🎉`);
    } catch (e) { showToast("Could not save quiz: " + (e as Error).message, "error"); }
  });
}

