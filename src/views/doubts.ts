import { addViewListener } from "../router";
import { state } from "../state";
import { dbAdd, dbUpdate, dbWatch } from "../store";
import { $, esc, showToast, timeAgo } from "../helpers";
import type { Doubt } from "../types";

export function renderDoubts(): void {
  if (!state.profile) return;
  const me = state.profile;
  const root = $("#doubts-root");

  /* Track previous statuses so the student gets a toast when a doubt gets solved */
  const prevStatus = new Map<string, string>();
  let firstLoad = true;

  if (me.role === "student") {
    root.innerHTML = `
      <div class="card">
        <h3>❓ Post a Doubt</h3>
        <p class="hint">Any teacher can see your doubt and solve it — the answer will appear here instantly.</p>
        <input class="js-d-subject" placeholder="Subject (e.g., Mathematics)">
        <textarea class="js-d-question" rows="3" placeholder="What is your doubt?"></textarea>
        <button class="btn btn-primary js-d-post" type="button">Post Doubt</button>
      </div>
      <h3>My Doubts</h3>
      <div id="doubt-list"><div class="loading">Loading…</div></div>`;
    root.querySelector(".js-d-post")!.addEventListener("click", () => void (async () => {
      const subject = ($(".js-d-subject") as HTMLInputElement).value.trim();
      const question = ($(".js-d-question") as HTMLTextAreaElement).value.trim();
      if (!subject || !question) { showToast("Fill subject and question", "error"); return; }
      await dbAdd("doubts", {
        studentUid: me.uid, studentName: me.name, subject, question,
        status: "open", createdAt: Date.now(),
      });
      ($(".js-d-question") as HTMLTextAreaElement).value = "";
      ($(".js-d-subject") as HTMLInputElement).value = "";
      showToast("Doubt posted — teachers can see it now ✅");
    })());
  } else {
    root.innerHTML = `
      <h3>❓ Doubt Solve — questions from students</h3>
      <p class="hint">Click <b>✍️ Solve this doubt</b> on any card, write your answer, and it goes straight to that student — live.</p>
      <div id="doubt-list"><div class="loading">Loading…</div></div>`;
  }

  const unsub = dbWatch<Doubt>("doubts", { orderBy: ["createdAt", "desc"], limit: 100 }, (all) => {
    const docs = me.role === "student" ? all.filter((d) => d.studentUid === me.uid) : all;
    const list = $("#doubt-list");
    if (!list) return;

    /* Notify the student the moment a teacher solves one of their doubts */
    if (!firstLoad && me.role === "student") {
      for (const d of docs) {
        if (prevStatus.get(d.id) === "open" && d.status === "solved") {
          showToast(`🎉 ${d.answeredBy ?? "A teacher"} solved your ${d.subject} doubt!`);
        }
      }
    }
    for (const d of docs) prevStatus.set(d.id, d.status);
    firstLoad = false;

    list.innerHTML = docs.map((d) => {
      const isSolved = d.status === "solved";
      const showSolveBox = me.role === "teacher" && !isSolved;
      return `<div class="card doubt ${d.status}">
        <div class="post-head"><b>${esc(d.studentName)}</b>
          <span class="badge">${esc(d.subject)}</span>
          <span class="badge ${isSolved ? "green" : "orange"}">${isSolved ? "✅ solved" : "⏳ open"}</span>
          <span class="muted">${timeAgo(d.createdAt)}</span></div>
        <p><b>Q:</b> ${esc(d.question)}</p>
        ${isSolved
          ? `<p class="answer"><b>✅ Answer from ${esc(d.answeredBy ?? "Teacher")}:</b> ${esc(d.answer ?? "")}</p>`
          : showSolveBox
            ? `<button class="btn btn-primary js-solve-toggle" type="button">✍️ Solve this doubt</button>
               <div class="js-solve-box hidden" style="margin-top:10px">
                 <textarea class="js-answer" rows="2" placeholder="Write your answer for ${esc(d.studentName)}…"></textarea>
                 <button class="btn btn-primary js-answer-btn" data-id="${d.id}" type="button">Send Answer → Student</button>
               </div>`
            : `<p class="muted">Waiting for a teacher to solve this…</p>`}
      </div>`;
    }).join("") || `<p class="muted">No doubts yet.</p>`;

    /* Teacher: toggle the answer box open/closed */
    list.querySelectorAll(".js-solve-toggle").forEach((b) =>
      b.addEventListener("click", () => {
        const card = (b as HTMLElement).closest(".doubt");
        const box = card?.querySelector(".js-solve-box") as HTMLElement | null;
        if (!box) return;
        box.classList.toggle("hidden");
        if (!box.classList.contains("hidden")) {
          (box.querySelector(".js-answer") as HTMLTextAreaElement)?.focus();
        }
      }));

    /* Teacher: send the answer → student receives it live */
    if (me.role === "teacher") {
      list.querySelectorAll(".js-answer-btn").forEach((b) =>
        b.addEventListener("click", () => void (async () => {
          const card = (b as HTMLElement).closest(".doubt")!;
          const ta = card.querySelector(".js-answer") as HTMLTextAreaElement | null;
          const answer = ta?.value.trim() ?? "";
          if (!answer) { showToast("Write an answer first", "error"); return; }
          await dbUpdate("doubts", (b as HTMLElement).dataset.id!, {
            status: "solved", answer, answeredBy: me.name, answeredAt: Date.now(),
          });
          showToast("Answer sent — the student got it ✅");
        })()));
    }
  });
  addViewListener(unsub);
}