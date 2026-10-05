import { getQuizzes, showQuizModal } from "../quiz";
import { addViewListener } from "../router";
import { state } from "../state";
import { dbAdd, dbList, dbWatch } from "../store";
import { $, $$, esc, showToast, timeAgo, todayStr } from "../helpers";
import type { Attendance, ClassSession, ContentItem } from "../types";

let session: ClassSession | null = null;
let connected = false;
let stars = 0;
let log: string[] = [];
let items: ContentItem[] = [];
let contentUnsub: (() => void) | null = null;
let contentSid = "";

export function renderInclass(): void {
  session = null; connected = false; stars = 0; log = []; items = [];
  if (contentUnsub) { contentUnsub(); contentUnsub = null; contentSid = ""; }

  const root = $("#inclass-root");
  root.innerHTML = `
    <p class="hint">🖱️ 3-Device System — <b class="t-tab">Tab</b> ⇄ <b class="t-hw">Hardware</b> ⇄ <b class="t-hood">Teacher's Hood</b> (interlinked, real-time).
    <br>⚠️ Your teacher &amp; you must use the <b>same class name</b> (e.g. "Class 10-A").</p>
    <div class="grid-3">
      <div class="card device dev-tab"><h3>📱 Tab (Student)</h3><div id="tab-body"><div class="loading">…</div></div></div>
      <div class="card device dev-hw"><h3>🖥️ Hardware (class sensor)</h3><div id="hw-body"><div class="loading">…</div></div></div>
      <div class="card device dev-hood"><h3>🎓 Teacher's Hood</h3><div id="hood-body"><div class="loading">…</div></div></div>
    </div>
    <div class="card hidden" id="rate-card">
      <h3>⭐ Rate today's teacher (Tab → end of class)</h3>
      <div class="star-row" id="star-row">
        ${[1, 2, 3, 4, 5].map((v) => `<button class="star" data-v="${v}" type="button">★</button>`).join("")}
      </div>
      <textarea class="js-rate-comment" rows="2" placeholder="Leave a comment (optional)"></textarea>
      <button class="btn btn-primary js-rate-send" type="button">Submit Rating</button>
    </div>`;

  $("#star-row").addEventListener("click", (e: Event) => {
    const b = (e.target as HTMLElement).closest(".star") as HTMLElement | null;
    if (!b) return;
    stars = Number(b.dataset.v);
    $$("#star-row .star").forEach((s) =>
      s.classList.toggle("on", Number((s as HTMLElement).dataset.v) <= stars));
  });
  $(".js-rate-send").addEventListener("click", () => void submitRating());

  const unsub = dbWatch<ClassSession>("sessions", { where: [["active", "==", true]] }, (list) => {
    list.sort((a, b) => (b.startedAt ?? 0) - (a.startedAt ?? 0));
    session = list.find((s) => s.className === state.profile?.className) ?? null;
    if (session) subscribeContents(session.id);
    paint();
  });
  addViewListener(unsub);
}

function subscribeContents(sid: string): void {
  if (contentUnsub && contentSid === sid) return;
  if (contentUnsub) contentUnsub();
  contentSid = sid;
  contentUnsub = dbWatch<ContentItem>("contents", { orderBy: ["createdAt", "desc"], limit: 30 }, (list) => {
    items = list.filter((it) => it.sessionId === sid);
    paintContents();
  });
  addViewListener(contentUnsub);
}

function paintContents(): void {
  const box = document.getElementById("tab-content");
  if (!box) return;
  box.innerHTML = items.map((it) => {
    if (it.type === "test") {
      return `<div class="content-item test"><b>🧪 Class Test</b><p>${esc(it.text)}</p>
        <button class="btn btn-primary js-open-test" data-id="${it.id}" type="button">Open Test</button></div>`;
    }
    if (it.type === "video") {
      return `<div class="content-item"><b>🎬 Video from teacher</b><br>
        <a href="${esc(it.text)}" target="_blank" rel="noopener">${esc(it.text)}</a></div>`;
    }
    return `<div class="content-item"><b>📒 Note from teacher</b><p>${esc(it.text)}</p></div>`;
  }).join("") || `<p class="muted">No content pushed yet.</p>`;

  box.querySelectorAll(".js-open-test").forEach((b) =>
    b.addEventListener("click", () => {
      const it = items.find((x) => x.id === (b as HTMLElement).dataset.id);
      if (it?.quiz) showQuizModal(
        { id: it.id, question: it.quiz.question, options: it.quiz.options,
          correctIndex: it.quiz.correctIndex, subject: it.quiz.subject ?? "General" },
        10, "Class Test", it.sessionId);
    }));
}

function paint(): void {
  const tabBody = document.getElementById("tab-body");
  const hwBody = document.getElementById("hw-body");
  const hoodBody = document.getElementById("hood-body");
  const rateCard = document.getElementById("rate-card");
  if (!tabBody || !hwBody || !hoodBody || !rateCard) return;

  if (!session) {
    tabBody.innerHTML = `<p class="muted">No live class for your class right now. Your teacher starts the class from the Teacher's Hood.</p>`;
    hwBody.innerHTML = `<p class="muted">Hardware idle — waiting for a session.</p>`;
    hoodBody.innerHTML = `<p class="conn off">🔴 Teacher is NOT logged in to the Hood</p>`;
    rateCard.classList.add("hidden");
    return;
  }

  tabBody.innerHTML = `
    <p class="conn ${connected ? "on" : "off"}">${connected ? "🟢 Connected to Hardware" : "🔴 Not connected"}</p>
    ${connected
      ? `<button class="btn js-tab-disconnect" type="button">Disconnect</button>`
      : `<button class="btn btn-primary js-tab-connect" type="button">🔗 Connect to Hardware</button>`}
    <div class="content-stream" id="tab-content"><p class="muted">No content pushed yet.</p></div>`;
  tabBody.querySelector(".js-tab-connect")?.addEventListener("click", () => void connectTab());
  tabBody.querySelector(".js-tab-disconnect")?.addEventListener("click", () => {
    connected = false;
    log.push("⚠️ " + (state.profile?.name ?? "Student") + " disconnected from Hardware");
    paint();
  });

  hwBody.innerHTML = `
    <div class="profile-row"><span>Teacher</span><b>${esc(session.teacherName)}</b></div>
    <div class="profile-row"><span>Subject</span><b>${esc(session.subject)}</b></div>
    <div class="profile-row"><span>Started</span><b>${timeAgo(session.startedAt)}</b></div>
    <div class="profile-row"><span>Your attendance</span><b>${connected ? "✅ Present (Tab–Hardware)" : "⏳ Pending"}</b></div>
    <button class="btn js-hw-quiz" type="button">Simulate: student not listening → pop quiz</button>
    <h4>Activity log</h4>
    <ul class="hw-log">${log.slice(-6).map((l) => `<li>${esc(l)}</li>`).join("") || `<li class="muted">No activity yet.</li>`}</ul>`;
  hwBody.querySelector(".js-hw-quiz")?.addEventListener("click", () => void popHardwareQuiz());

  hoodBody.innerHTML = `
    <p class="conn on">🟢 Teacher logged in to Hood — session LIVE</p>
    <div class="profile-row"><span>Teacher attendance</span><b>✅ Marked (Hood login)</b></div>
    <p class="hint" style="margin-top:8px">Teacher can push notes, videos and class tests to your Tab from the Hood.</p>`;

  rateCard.classList.remove("hidden");
  paintContents();
}

async function connectTab(): Promise<void> {
  if (!state.profile || !session) return;
  const me = state.profile;
  const s = session;
  const today = todayStr();
  const todays = await dbList<Attendance>("attendance", { where: [["date", "==", today]] });
  const already = todays.some((a) => a.uid === me.uid && a.sessionId === s.id);
  if (!already) {
    await dbAdd("attendance", {
      date: today, uid: me.uid, name: me.name, role: me.role,
      status: "present", method: "tab-hardware", sessionId: s.id, createdAt: Date.now(),
    });
  }
  connected = true;
  log.push("✅ " + me.name + ": Tab linked to Hardware — attendance marked (distance OK)");
  paint();
  showToast("Attendance marked via Tab ⇄ Hardware link ✅");
}

async function submitRating(): Promise<void> {
  if (!state.profile || !session) { showToast("No live class to rate", "error"); return; }
  if (stars === 0) { showToast("Pick a star rating first", "error"); return; }
  const s = session;
  const comment = ($(".js-rate-comment") as HTMLTextAreaElement).value.trim();
  await dbAdd("ratings", {
    teacherUid: s.teacherUid, teacherName: s.teacherName,
    studentUid: state.profile.uid, studentName: state.profile.name,
    stars, comment, createdAt: Date.now(),
  });
  ($(".js-rate-comment") as HTMLTextAreaElement).value = "";
  showToast("Thanks for rating! ⭐");
}

async function popHardwareQuiz(): Promise<void> {
  const qs = await getQuizzes();
  const q = qs[Math.floor(Math.random() * qs.length)];
  if (!q) return;
  log.push("🔔 Hardware detected inattention → quiz popped on Tab");
  paint();
  showQuizModal(q, 5, "Hardware Attention Check");
}