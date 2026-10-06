--------------------------------------------------------------------------------
import { state } from "../state";
import { dbAdd, dbUpdate, dbWatch } from "../store";
import { esc, showToast, timeAgo } from "../helpers";
import { classLabel } from "../catalog";
import { checkTeacherLate } from "../hardware";
import { generateQuiz } from "../quiz";
import { audit } from "../auditlog";
import type { ClassSession, Doubt } from "../types";

export function render(root: HTMLElement): void {
  const me = state.profile!;
  root.innerHTML = `
    <div class="card"><h3>📡 Live class control</h3>
      <p class="muted small">Class: <b>${classLabel(me.className)}</b> · Subject: <b>${esc(me.subject ?? "—")}</b></p>
      <button id="tl-start" class="btn btn-primary" type="button">▶ Start class</button>
      <button id="tl-end" class="btn" type="button" disabled>⏹ End class</button>
      <span id="tl-status" class="muted small"></span></div>
    <div class="grid2">
      <div class="card"><h3>📤 Post content to class</h3>
        <select id="tl-type"><option value="note">📝 Note</option><option value="video">🎬 Video link</option><option value="test">🧩 Quiz</option></select>
        <textarea id="tl-text" rows="2" placeholder="Note text / video URL / quiz topic" style="margin-top:8px"></textarea>
        <button id="tl-send" class="btn btn-primary" style="margin-top:8px" type="button">Send to class</button>
        <div id="tl-quizbox" class="hidden"><p class="muted small">Rule-based quiz preview (offline generator):</p><ol id="tl-qlist" class="small"></ol></div></div>
      <div class="card"><h3>🙋 Open doubts</h3><div id="tl-doubts"><p class="muted">—</p></div></div>
    </div>`;
  let sessionId: string | null = null;
  const startBtn = root.querySelector("#tl-start") as HTMLButtonElement;
  const endBtn = root.querySelector("#tl-end") as HTMLButtonElement;
  const statusEl = root.querySelector("#tl-status") as HTMLElement;
  const sendBtn = root.querySelector("#tl-send") as HTMLButtonElement;

  dbWatch<ClassSession>("sessions", { where: [["teacherUid", "==", me.uid]], limit: 3 }, (rows) => {
    const s = rows.filter((r) => r.active)[0];
    sessionId = s?.id ?? null;
    startBtn.disabled = Boolean(sessionId);
    endBtn.disabled = !sessionId;
    statusEl.textContent = sessionId && s ? ` LIVE since ${timeAgo(s.startedAt)}` : "";
  });

  startBtn.onclick = async () => {
    if (sessionId) return;
    const id = await dbAdd("sessions", { teacherUid: me.uid, teacherName: me.name, subject: me.subject ?? "General", className: me.className ?? "", startedAt: Date.now(), active: true });
    sessionId = id;
    startBtn.disabled = true; endBtn.disabled = false;
    await checkTeacherLate(me.uid, me.name);
    await audit("session_started", `${me.subject} ${classLabel(me.className)}`);
    showToast("Class started 🔴");
  };
  endBtn.onclick = async () => {
    if (!sessionId) return;
    await dbUpdate("sessions", sessionId, { active: false, actualEnd: Date.now() });
    sessionId = null; startBtn.disabled = false; endBtn.disabled = true;
    await audit("session_ended", "");
    showToast("Class ended ⏹");
  };

  const typeSel = root.querySelector("#tl-type") as HTMLSelectElement;
  typeSel.onchange = () => {
    const qb = root.querySelector("#tl-quizbox") as HTMLElement;
    if (typeSel.value === "test") {
      const topic = (root.querySelector("#tl-text") as HTMLTextAreaElement).value.trim();
      const qs = generateQuiz(topic, me.subject ?? "General", 3);
      qb.classList.remove("hidden");
      (root.querySelector("#tl-qlist") as HTMLElement).innerHTML = qs.map((q) => `<li>${esc(q.question)}</li>`).join("");
      sendBtn.dataset.quiz = JSON.stringify(qs);
    } else { qb.classList.add("hidden"); delete sendBtn.dataset.quiz; }
  };
  sendBtn.onclick = async () => {
    if (!sessionId) { showToast("Start the class first", "error"); return; }
    const text = (root.querySelector("#tl-text") as HTMLTextAreaElement).value.trim();
    if (!text) { showToast("Type something first", "error"); return; }
    const data: Record<string, unknown> = { sessionId, type: typeSel.value, text, createdAt: Date.now() };
    if (sendBtn.dataset.quiz) data.quiz = JSON.parse(sendBtn.dataset.quiz);
    await dbAdd("contents", data);
    (root.querySelector("#tl-text") as HTMLTextAreaElement).value = "";
    showToast("Sent to class ✅");
  };

  const dEl = root.querySelector("#tl-doubts") as HTMLElement;
  dbWatch<Doubt>("doubts", { where: [["status", "==", "open"]], limit: 30 }, (rows) => {
    const mine = rows.filter((d) => d.subject === (me.subject ?? ""));
    const shown = mine.length ? mine : rows.slice(0, 5);
    dEl.innerHTML = shown.length
      ? shown.map((d) => `<div class="card small-card"><b>${esc(d.studentName)}</b> · ${esc(d.subject)}<p>${esc(d.question)}</p></div>`).join("")
      : `<p class="muted">No open doubts 🎉</p>`;
  });
}

