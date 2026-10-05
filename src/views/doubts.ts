import { addViewListener } from "../router";
import { state } from "../state";
import { dbAdd, dbUpdate, dbWatch } from "../store";
import { $, esc, showToast, timeAgo } from "../helpers";
import type { Doubt } from "../types";

export function renderDoubts(): void {
  if (!state.profile) return;
  const me = state.profile;
  const root = $("#doubts-root");

  if (me.role === "student") {
    root.innerHTML = `
      <div class="card">
        <h3>❓ Post a Doubt</h3>
        <input class="js-d-subject" placeholder="Subject (e.g., Mathematics)">
        <textarea class="js-d-question" rows="3" placeholder="What is your doubt?"></textarea>
        <button class="btn btn-primary js-d-post" type="button">Post Doubt</button>
      </div>
      <h3>My Doubts</h3>
      <div id="doubt-list"></div>`;
    root.querySelector(".js-d-post")!.addEventListener("click", () => void (async () => {
      const subject = ($(".js-d-subject") as HTMLInputElement).value.trim();
      const question = ($(".js-d-question") as HTMLTextAreaElement).value.trim();
      if (!subject || !question) { showToast("Fill subject and question", "error"); return; }
      await dbAdd("doubts", {
        studentUid: me.uid, studentName: me.name, subject, question,
        status: "open", createdAt: Date.now(),
      });
      ($(".js-d-question") as HTMLTextAreaElement).value = "";
      showToast("Doubt posted — a teacher will answer soon ✅");
    })());
  } else {
    root.innerHTML = `<h3>❓ Doubt Solve — questions from students</h3><div id="doubt-list"></div>`;
  }

  const unsub = dbWatch<Doubt>("doubts", { orderBy: ["createdAt", "desc"], limit: 100 }, (all) => {
    const docs = me.role === "student" ? all.filter((d) => d.studentUid === me.uid) : all;
    const list = $("#doubt-list");
    list.innerHTML = docs.map((d) => `
      <div class="card doubt ${d.status}">
        <div class="post-head"><b>${esc(d.studentName)}</b>
          <span class="badge">${esc(d.subject)}</span>
          <span class="badge ${d.status === "solved" ? "green" : "orange"}">${esc(d.status)}</span>
          <span class="muted">${timeAgo(d.createdAt)}</span></div>
        <p><b>Q:</b> ${esc(d.question)}</p>
        ${d.status === "solved"
          ? `<p class="answer"><b>✅ ${esc(d.answeredBy ?? "Teacher")}:</b> ${esc(d.answer ?? "")}</p>`
          : me.role === "teacher"
            ? `<textarea class="js-answer" rows="2" placeholder="Write your answer…"></textarea>
               <button class="btn btn-primary js-answer-btn" data-id="${d.id}" type="button">Send Answer</button>`
            : ""}
      </div>`).join("") || `<p class="muted">No doubts yet.</p>`;

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
          showToast("Answer sent ✅");
        })()));
    }
  });
  addViewListener(unsub);
}