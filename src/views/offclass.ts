import { getQuizzes, showQuizModal } from "../quiz";
import { state } from "../state";
import { dbAdd, dbList, dbWatch } from "../store";
import { $, esc, showToast, timeAgo } from "../helpers";
import type { Assignment, MarkEntry, Quiz, Submission } from "../types";

let mySubs: Submission[] = [];
let unsubSubs: (() => void) | null = null;

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
  if (unsubSubs) { unsubSubs(); unsubSubs = null; }

  if (tab === "hw") {
    const rows = await dbList<Assignment>("assignments", { limit: 50 });
    rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    body.innerHTML = `<div id="hw-list"><div class="loading">Loading…</div></div>`;
    const list = $("#hw-list", body)!;
    const paintHw = (): void => {
      list.innerHTML = rows.map((a) => {
        const mine = mySubs.find((s) => s.assignmentId === a.id);
        return `<div class="card">
          <h3>📘 ${esc(a.title)}</h3>
          <p class="muted">Subject: ${esc(a.subject ?? "—")} · Due: ${esc(a.dueDate ?? "—")} · by ${esc(a.by ?? "Teacher")} · max ${a.maxMarks ?? 10} marks</p>
          ${mine
            ? `<p class="answer">✅ Submitted ${timeAgo(mine.submittedAt)}
               ${typeof mine.marksGiven === "number" ? `· <b>Marks: ${mine.marksGiven}/${mine.marksMax ?? a.maxMarks ?? 10}</b> ${mine.feedback ? "· 📝 " + esc(mine.feedback) : ""}` : "· awaiting marks"}</p>`
            : `<div class="add-topic">
                 <input class="js-sub-text" data-id="${a.id}" placeholder="Your answer / notes" style="flex:1">
                 <input class="js-sub-link" data-id="${a.id}" placeholder="Link (optional)">
                 <button class="btn btn-primary js-submit" data-id="${a.id}" data-title="${esc(a.title)}" type="button">Submit</button>
               </div>`}
        </div>`;
      }).join("") || `<p class="muted">No assignments yet.</p>`;
      list.querySelectorAll(".js-submit").forEach((b) =>
        b.addEventListener("click", () => void (async () => {
          const el = b as HTMLElement;
          const card = el.closest(".card")!;
          const text = (card.querySelector(".js-sub-text") as HTMLInputElement).value.trim();
          const link = (card.querySelector(".js-sub-link") as HTMLInputElement).value.trim();
          if (!text && !link) { showToast("Write an answer or add a link", "error"); return; }
          await dbAdd("submissions", {
            assignmentId: el.dataset.id!, assignmentTitle: el.dataset.title!,
            studentUid: state.profile!.uid, studentName: state.profile!.name,
            text, link, submittedAt: Date.now(),
          });
          showToast("Submitted ✅ — teacher will mark it");
        })()));
    };
    paintHw();
    unsubSubs = dbWatch<Submission>("submissions", { where: [["studentUid", "==", state.profile.uid]], limit: 100 }, (rows) => {
      mySubs = rows;
      paintHw();
    });
    return;
  }

  if (tab === "marks") {
    const rows = await dbList<MarkEntry>("marks", { where: [["studentUid", "==", state.profile.uid]] });
    rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const subMarks = mySubs.filter((s) => typeof s.marksGiven === "number");
    body.innerHTML = (rows.length || subMarks.length) ? `
      <div class="card"><table class="table">
        <thead><tr><th>Exam</th><th>Subject</th><th>Score</th><th>Date</th></tr></thead>
        <tbody>${rows.map((m) => `<tr><td>${esc(m.exam)}</td><td>${esc(m.subject)}</td>
          <td>${m.score} / ${m.total}</td><td>${new Date(m.createdAt).toLocaleDateString()}</td></tr>`).join("")}
          ${subMarks.map((s) => `<tr><td>📘 ${esc(s.assignmentTitle ?? "Assignment")}</td><td>Assignment</td>
          <td>${s.marksGiven} / ${s.marksMax ?? 10}</td><td>${new Date(s.submittedAt).toLocaleDateString()}</td></tr>`).join("")}
        </tbody></table></div>`
      : `<p class="muted">No marks yet. Attempt quizzes &amp; submit assignments to build your record.</p>`;
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
      if (q) showQuizModal(q as Quiz, 5, "Practice Quiz");
    }));
}