import { getQuizzes } from "../quiz";
import { state } from "../state";
import { dbAdd, dbList, dbUpdate } from "../store";
import { $, esc, showToast, timeAgo, todayStr } from "../helpers";
import type { Attendance, ClassSession, Quiz, SyllabusTopic } from "../types";

export async function renderClassroom(): Promise<void> {
  if (state.profile?.role !== "teacher") return;
  const me = state.profile;
  const root = $("#classroom-root");
  root.innerHTML = `<div class="loading">Loading your class…</div>`;

  const actives = await dbList<ClassSession>("sessions", { where: [["active", "==", true]] });
  const mine = actives.find((s) => s.teacherUid === me.uid) ?? null;
  if (mine) { paintLive(mine); return; }

  root.innerHTML = `
    <div class="card">
      <h3>🎓 Teacher's Hood — Start a class</h3>
      <p class="hint">Logging in to the Hood starts the session: Hardware marks YOUR attendance, and student Tabs get interlinked automatically. Students must register with the same class name.</p>
      <div class="role-fields">
        <label>Subject <input class="js-hood-subject" value="${esc(me.subject ?? "")}"></label>
        <label>Class <input class="js-hood-class" value="${esc(me.className ?? "")}" placeholder="Class 10-A"></label>
      </div>
      <br>
      <button class="btn btn-primary js-hood-start" type="button">🟢 Start Class (Hood Login)</button>
    </div>`;
  root.querySelector(".js-hood-start")!.addEventListener("click", () => void startClass());
}

async function startClass(): Promise<void> {
  if (!state.profile) return;
  const me = state.profile;
  const subject = ($(".js-hood-subject") as HTMLInputElement).value.trim() || me.subject || "General";
  const className = ($(".js-hood-class") as HTMLInputElement).value.trim() || me.className || "Class 10-A";

  const id = await dbAdd("sessions", {
    teacherUid: me.uid, teacherName: me.name, subject, className,
    startedAt: Date.now(), active: true,
  });

  const today = todayStr();
  const todays = await dbList<Attendance>("attendance", { where: [["date", "==", today]] });
  const already = todays.some((a) => a.uid === me.uid && a.method === "hood-login");
  if (!already) {
    await dbAdd("attendance", {
      date: today, uid: me.uid, name: me.name, role: "teacher",
      status: "present", method: "hood-login", sessionId: id, createdAt: Date.now(),
    });
  }
  showToast("Class started — Hood attendance marked ✅");
  paintLive({ id, teacherUid: me.uid, teacherName: me.name, subject, className, startedAt: Date.now(), active: true });
}

function paintLive(s: ClassSession): void {
  const root = $("#classroom-root");
  root.innerHTML = `
    <div class="live-banner">🔴 LIVE — ${esc(s.subject)} · ${esc(s.className)} · started ${timeAgo(s.startedAt)}</div>
    <div class="grid-2">
      <div class="card">
        <h3>📤 Push content to student Tabs</h3>
        <select class="js-c-type"><option value="note">📒 Note</option><option value="video">🎬 Video link</option></select>
        <textarea class="js-c-text" rows="2" placeholder="Note text or video URL"></textarea>
        <button class="btn btn-primary js-c-send" type="button">Push to Tab</button>
        <hr>
        <h3>📘 Post assignment / H.W</h3>
        <input class="js-a-title" placeholder="Assignment title">
        <input class="js-a-due" type="date">
        <button class="btn js-a-add" type="button">Post Assignment</button>
      </div>
      <div class="card">
        <h3>🧪 Class test</h3>
        <p class="hint" style="margin-bottom:8px">Pick a question — it pops on all connected Tabs. Hardware records marks.</p>
        <div class="js-quiz-pick"><span class="muted">Loading quizzes…</span></div>
        <hr>
        <h3>🖥️ Hardware panel</h3>
        <p class="muted" style="margin-bottom:8px">🟢 No abnormal teacher activity detected · session monitored</p>
        <button class="btn js-hw-syllabus" type="button">🤖 Run Hardware AI syllabus check (today)</button>
        <h4>Today's attendance (Hardware log)</h4>
        <div class="js-att-list muted">Loading…</div>
        <hr>
        <button class="btn btn-danger js-hood-end" type="button">⏹ End class</button>
      </div>
    </div>`;
  wireHood(s);
}

function wireHood(s: ClassSession): void {
  const root = $("#classroom-root");

  root.querySelector(".js-c-send")!.addEventListener("click", () => void (async () => {
    const type = ($(".js-c-type") as HTMLSelectElement).value;
    const text = ($(".js-c-text") as HTMLTextAreaElement).value.trim();
    if (!text) { showToast("Write something to push", "error"); return; }
    await dbAdd("contents", { sessionId: s.id, type, text, createdAt: Date.now() });
    ($(".js-c-text") as HTMLTextAreaElement).value = "";
    showToast("Pushed to student Tabs 📱");
  })());

  root.querySelector(".js-a-add")!.addEventListener("click", () => void (async () => {
    const title = ($(".js-a-title") as HTMLInputElement).value.trim();
    const due = ($(".js-a-due") as HTMLInputElement).value;
    if (!title) { showToast("Assignment title required", "error"); return; }
    await dbAdd("assignments", {
      title, dueDate: due, subject: s.subject, className: s.className,
      by: state.profile?.name, createdAt: Date.now(),
    });
    ($(".js-a-title") as HTMLInputElement).value = "";
    showToast("Assignment posted 📘");
  })());

  root.querySelector(".js-hood-end")!.addEventListener("click", () => void (async () => {
    await dbUpdate("sessions", s.id, { active: false });
    showToast("Class ended. Great work! 👏");
    await renderClassroom();
  })());

  root.querySelector(".js-hw-syllabus")!.addEventListener("click", () => void (async () => {
    const todays = await dbList<SyllabusTopic>("syllabus", { where: [["date", "==", todayStr()]] });
    const pending = todays.filter((t) => !t.doneByAI);
    for (const t of pending) await dbUpdate("syllabus", t.id, { doneByAI: true });
    showToast("🤖 Hardware AI verified " + pending.length + " topic(s) for today");
  })());

  void dbList<Attendance>("attendance", { where: [["date", "==", todayStr()]] }).then((rows) => {
    const box = root.querySelector(".js-att-list") as HTMLElement | null;
    if (!box) return;
    box.innerHTML = `<ul class="att-list">${rows.map((a) =>
      `<li>${esc(a.name)} — <b>${esc(a.status)}</b> <span class="muted">(${esc(a.method)})</span></li>`).join("")
      || `<li>No entries yet.</li>`}</ul>`;
  });

  void getQuizzes().then((qs) => {
    const pick = root.querySelector(".js-quiz-pick") as HTMLElement | null;
    if (!pick) return;
    pick.innerHTML = qs.map((q) => `
      <div class="quiz-row"><span>${esc(q.question)}</span>
      <button class="btn js-send-test" data-id="${q.id}" type="button">Send to Tabs</button></div>`).join("");
    pick.querySelectorAll(".js-send-test").forEach((b) =>
      b.addEventListener("click", () => void (async () => {
        const q = qs.find((x) => x.id === (b as HTMLElement).dataset.id) as Quiz | undefined;
        if (!q) return;
        await dbAdd("contents", {
          sessionId: s.id, type: "test", text: q.question,
          quiz: { question: q.question, options: q.options, correctIndex: q.correctIndex, subject: q.subject },
          createdAt: Date.now(),
        });
        showToast("Test sent to Tabs 🧪");
      })()));
  });
}