import { getQuizzes, showQuizModal } from "../quiz";
import { state } from "../state";
import { dbList } from "../store";
import { $, esc, showToast } from "../helpers";
import type { Assignment, MarkEntry, Quiz } from "../types";

export async function renderOffclass(): Promise<void> {
  if (!state.profile) return;
  const root = $("#offclass-root");
  root.innerHTML = `
    <div class="subtabs">
      <button class="subtab active" data-t="hw" type="button">📘 H.W / Assignments</button>
      <button class="subtab" data-t="marks" type="button">📊 Marks</button>
      <button class="subtab" data-t="quiz" type="button">🧠 Practice &amp; Quiz</button>
    </div>
    <div id="offclass-body"><div class="loading">Loading…</div></div>`;

  const body = $("#offclass-body");
  root.querySelectorAll(".subtab").forEach((b) =>
    b.addEventListener("click", () => {
      root.querySelectorAll(".subtab").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      void paintOff((b as HTMLElement).dataset.t!, body);
    }));
  await paintOff("hw", body);
}

async function paintOff(tab: string, body: HTMLElement): Promise<void> {
  if (!state.profile) return;
  body.innerHTML = `<div class="loading">Loading…</div>`;

  if (tab === "hw") {
    const rows = await dbList<Assignment>("assignments", { orderBy: ["createdAt", "desc"], limit: 50 });
    body.innerHTML = rows.map((a) => `
      <div class="card"><h3>📘 ${esc(a.title)}</h3>
        <p class="muted">Subject: ${esc(a.subject ?? "—")} · Due: ${esc(a.dueDate ?? "—")} · posted by ${esc(a.by ?? "Teacher")}</p>
      </div>`).join("") || `<p class="muted">No assignments yet.</p>`;
    return;
  }

  if (tab === "marks") {
    const rows = await dbList<MarkEntry>("marks", { where: [["studentUid", "==", state.profile.uid]] });
    rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    body.innerHTML = rows.length ? `
      <div class="card"><table class="table">
        <thead><tr><th>Exam</th><th>Subject</th><th>Score</th><th>Date</th></tr></thead>
        <tbody>${rows.map((m) => `<tr>
          <td>${esc(m.exam)}</td><td>${esc(m.subject)}</td>
          <td>${m.score} / ${m.total}</td>
          <td>${new Date(m.createdAt).toLocaleDateString()}</td></tr>`).join("")}
        </tbody></table></div>`
      : `<p class="muted">No marks yet. Attempt class tests &amp; quizzes to build your record.</p>`;
    return;
  }

  const quizzes = await getQuizzes();
  body.innerHTML = quizzes.map((q) => `
    <div class="card"><h3>${esc(q.question)}</h3><p class="muted">${esc(q.subject)}</p>
    <button class="btn btn-primary js-attempt" data-id="${q.id}" type="button">Attempt</button></div>`).join("")
    || `<p class="muted">No quizzes available.</p>`;
  body.querySelectorAll(".js-attempt").forEach((b) =>
    b.addEventListener("click", () => {
      const q = quizzes.find((x) => x.id === (b as HTMLElement).dataset.id);
      if (q) showQuizModal(q, 5, "Practice Quiz");
    }));
}