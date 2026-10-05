import "./style.css";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  signInWithEmailAndPassword,
  signOut,
  updateProfile,
} from "firebase/auth";
import {
  addDoc, arrayRemove, arrayUnion, collection, doc, getDoc, getDocs,
  increment, limit, onSnapshot, orderBy, query, setDoc, updateDoc, where,
} from "firebase/firestore";
import { auth, db, firebaseConfig } from "./firebase";
import type { ClassSession, Quiz, Role, SyllabusTopic, UserProfile } from "./types";

/* ================= state ================= */
let profile: UserProfile | null = null;
let navItems: NavItem[] = [];
let currentSession: ClassSession | null = null;
let tabConnected = false;
let ratingStars = 0;
let hwLog: string[] = [];
let quizCache: Quiz[] = [];
let latestTests: { quiz: Quiz; sessionId: string }[] = [];
let contentUnsub: (() => void) | null = null;
let contentSessionId = "";
let topicsByDate: Record<string, SyllabusTopic[]> = {};
let calYear = new Date().getFullYear();
let calMonth = new Date().getMonth();
let selectedDate = "";
const viewListeners: Array<() => void> = [];

interface NavItem { id: string; label: string; icon: string }
interface QuizState { quiz: Quiz | null; points: number; exam: string; sessionId: string; selected: number }
let quizState: QuizState = { quiz: null, points: 0, exam: "", sessionId: "", selected: -1 };

const NAV: Record<Role, NavItem[]> = {
  student: [
    { id: "profile", label: "My Profile", icon: "👤" },
    { id: "inclass", label: "In Class (3-Device)", icon: "📶" },
    { id: "offclass", label: "Off Class", icon: "📚" },
    { id: "social", label: "Student LinkedIn", icon: "💬" },
    { id: "doubts", label: "Post Doubts", icon: "❓" },
    { id: "projects", label: "Display Project", icon: "🛠️" },
  ],
  teacher: [
    { id: "profile", label: "My Profile", icon: "👤" },
    { id: "classroom", label: "Class Room (Hood)", icon: "🏫" },
    { id: "social", label: "Teacher LinkedIn", icon: "💬" },
    { id: "doubts", label: "Doubt Solve", icon: "❓" },
    { id: "timetable", label: "Time Table", icon: "🗓️" },
  ],
  hm: [{ id: "admin", label: "Overview", icon: "📊" }],
  meo: [{ id: "admin", label: "Overview", icon: "📊" }],
  deo: [{ id: "admin", label: "Overview", icon: "📊" }],
};

const DEMO_QUIZZES: Quiz[] = [
  { id: "d1", subject: "General", question: "What does CPU stand for?",
    options: ["Central Process Unit", "Central Processing Unit", "Computer Personal Unit", "Central Program Unit"], correctIndex: 1 },
  { id: "d2", subject: "General", question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Mercury"], correctIndex: 1 },
  { id: "d3", subject: "Mathematics", question: "What is 12 × 8?",
    options: ["86", "96", "108", "92"], correctIndex: 1 },
];

/* ================= helpers ================= */
function $<T extends HTMLElement = HTMLElement>(sel: string, scope: ParentNode = document): T {
  const el = scope.querySelector(sel);
  if (!el) throw new Error("Missing element: " + sel);
  return el as T;
}
function $$(sel: string, scope: ParentNode = document): HTMLElement[] {
  return Array.from(scope.querySelectorAll(sel)) as HTMLElement[];
}
function esc(s: unknown): string {
  return String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - ts) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  if (m < 1440) return Math.floor(m / 60) + "h ago";
  return Math.floor(m / 1440) + "d ago";
}
function starsHtml(n: number): string { return "★".repeat(n) + "☆".repeat(5 - n); }

let toastTimer: ReturnType<typeof setTimeout> | undefined;
function showToast(msg: string, type: "success" | "error" = "success") {
  const t = $("#toast");
  t.textContent = msg;
  t.className = "toast " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = "toast hidden"; }, 3400);
}

function authError(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-email": "Invalid email address.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
  };
  return map[code] ?? "Something went wrong. Please try again.";
}

function clearViewListeners() {
  viewListeners.forEach((u) => u());
  viewListeners.length = 0;
  if (contentUnsub) { contentUnsub(); contentUnsub = null; }
  contentSessionId = "";
  currentSession = null;
}

async function getQuizzes(): Promise<Quiz[]> {
  if (quizCache.length) return quizCache;
  const snap = await getDocs(collection(db, "quizzes"));
  quizCache = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as Quiz));
  if (!quizCache.length) quizCache = DEMO_QUIZZES;
  return quizCache;
}

/* ================= auth ================= */
onAuthStateChanged(auth, async (user) => {
  if (!user) { profile = null; clearViewListeners(); showAuth(); return; }
  const snap = await getDoc(doc(db, "users", user.uid));
  if (!snap.exists()) {
    showToast("Profile not found — please register.", "error");
    await signOut(auth);
    return;
  }
  profile = { ...(snap.data() as object), uid: user.uid } as UserProfile;
  showApp();
});

function showAuth() {
  $("#app").classList.add("hidden");
  $("#auth-screen").classList.remove("hidden");
}

function showApp() {
  if (!profile) return;
  $("#auth-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  $("#user-name").textContent = profile.name;
  const badge = $("#user-role");
  badge.textContent = profile.role.toUpperCase();
  badge.className = "badge role-" + profile.role;
  buildNav();
  showView(navItems[0]!.id);
}

function buildNav() {
  if (!profile) return;
  navItems = NAV[profile.role];
  const nav = $("#nav");
  nav.innerHTML = navItems
    .map((n) => `<button class="nav-btn" data-view="${n.id}"><span>${n.icon}</span>${n.label}</button>`)
    .join("");
  nav.querySelectorAll(".nav-btn").forEach((b) =>
    b.addEventListener("click", () => showView((b as HTMLElement).dataset.view!)));
}

function showView(id: string) {
  clearViewListeners();
  $$(".view").forEach((v) => v.classList.remove("active"));
  $(`#view-${id}`).classList.add("active");
  $$("#nav .nav-btn").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.view === id));
  const item = navItems.find((n) => n.id === id);
  $("#view-title").textContent = item ? item.label : "";
  const loaders: Record<string, () => void | Promise<void>> = {
    profile: renderProfile,
    inclass: renderInclass,
    offclass: renderOffclass,
    social: renderSocial,
    doubts: renderDoubts,
    projects: renderProjects,
    classroom: renderClassroom,
    timetable: renderTimetable,
    admin: renderAdmin,
  };
  void loaders[id]?.();
}

/* ================= 1 · PROFILE (student + teacher) ================= */
async function renderProfile() {
  if (!profile) return;
  const root = $("#profile-root");
  root.innerHTML = `<div class="loading">Loading profile…</div>`;

  const usersSnap = await getDocs(collection(db, "users"));
  const users = usersSnap.docs.map((d) => d.data() as UserProfile);
  const students = users.filter((u) => u.role === "student")
    .sort((a, b) => (b.airScore ?? 0) - (a.airScore ?? 0));
  const myRank = students.findIndex((s) => s.uid === profile!.uid) + 1;

  let html = `<div class="grid-2">
    <div class="card">
      <h3>👤 My Profile</h3>
      <div class="profile-row"><span>Name</span><b>${esc(profile.name)}</b></div>
      <div class="profile-row"><span>Email</span><b>${esc(profile.email)}</b></div>
      <div class="profile-row"><span>Role</span><b>${esc(profile.role.toUpperCase())}</b></div>
      ${profile.role === "student" ? `
        <div class="profile-row"><span>Student ID</span><b>${esc(profile.studentId ?? "—")}</b></div>
        <div class="profile-row"><span>Class</span><b>${esc(profile.className ?? "—")}</b></div>
        <div class="profile-row"><span>⚡ Air Score</span><b class="air">${profile.airScore ?? 0}</b></div>
        <div class="profile-row"><span>Leaderboard Rank</span><b>${myRank ? "#" + myRank : "—"}</b></div>` : ""}
      ${profile.role === "teacher" ? `
        <div class="profile-row"><span>Subject</span><b>${esc(profile.subject ?? "—")}</b></div>
        <div class="profile-row"><span>Class</span><b>${esc(profile.className ?? "—")}</b></div>` : ""}
    </div>
    <div class="card">
      <h3>🏆 Air Score Leaderboard</h3>
      <ol class="leaderboard">
        ${students.slice(0, 10).map((s, i) => `
          <li class="${s.uid === profile?.uid ? "me" : ""}">
            <span class="rank">${["🥇", "🥈", "🥉"][i] ?? "#" + (i + 1)}</span>
            <span class="name">${esc(s.name)}</span>
            <span class="score">${s.airScore ?? 0}</span>
          </li>`).join("") || `<li class="muted">No students yet.</li>`}
      </ol>
    </div>
  </div>`;

  if (profile.role === "teacher") {
    const rSnap = await getDocs(query(collection(db, "ratings"), orderBy("createdAt", "desc"), limit(100)));
    const mine = rSnap.docs.map((d) => d.data()).filter((r) => r.teacherUid === profile!.uid);
    const avg = mine.length ? mine.reduce((s, r) => s + (Number(r.stars) || 0), 0) / mine.length : 0;
    const badges: string[] = [];
    if (avg >= 4.5) badges.push("⭐ Star Educator");
    if (avg >= 4) badges.push("🏅 Inspiring Teacher");
    if (mine.length >= 5) badges.push("💬 Top Comments");
    html += `
    <div class="card">
      <h3>Teacher Performance (Achievements · Rating · Top comments)</h3>
      <div class="rating-summary">
        <div class="big-rating">${avg.toFixed(1)}<small>/5</small></div>
        <div>${starsHtml(Math.round(avg))}<br><span class="muted">${mine.length} rating(s)</span></div>
      </div>
      <div class="badges">${badges.map((b) => `<span class="badge green">${b}</span>`).join("") || `<span class="badge muted">No achievements yet</span>`}</div>
      <h4>Top comments</h4>
      <ul class="comment-list">
        ${mine.slice(0, 5).map((r) => `<li><b>${esc(r.studentName ?? "Student")}</b> ${starsHtml(Number(r.stars) || 0)}
          <p>${esc(r.comment ?? "")}</p></li>`).join("") || `<li class="muted">No comments yet.</li>`}
      </ul>
    </div>`;
  }
  root.innerHTML = html;
}

/* ================= 2 · IN CLASS — 3-DEVICE SYSTEM (student) ================= */
function renderInclass() {
  if (!profile) return;
  tabConnected = false; hwLog = []; ratingStars = 0;
  const root = $("#inclass-root");
  root.innerHTML = `
    <p class="hint">🖱️ 3-Device System — <b class="t-tab">Tab</b> ⇄ <b class="t-hw">Hardware</b> ⇄ <b class="t-hood">Teacher's Hood</b> (interlinked, real-time via Firestore)</p>
    <div class="grid-3">
      <div class="card device dev-tab"><h3>📱 Tab</h3><div id="tab-body"><div class="loading">…</div></div></div>
      <div class="card device dev-hw"><h3>🖥️ Hardware</h3><div id="hw-body"><div class="loading">…</div></div></div>
      <div class="card device dev-hood"><h3>🎓 Teacher's Hood</h3><div id="hood-body"><div class="loading">…</div></div></div>
    </div>
    <div class="card hidden" id="rate-card">
      <h3>⭐ Rate today's teacher</h3>
      <p class="hint" style="margin-bottom:8px">Tab allows rating the teacher at the end of class.</p>
      <div class="star-row" id="star-row">
        ${[1, 2, 3, 4, 5].map((v) => `<button class="star js-star" data-v="${v}" type="button">★</button>`).join("")}
      </div>
      <textarea class="js-rate-comment" rows="2" placeholder="Leave a comment (optional)"></textarea>
      <button class="btn btn-primary js-rate-send" type="button">Submit Rating</button>
    </div>`;

  $("#star-row").addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest(".js-star") as HTMLElement | null;
    if (!b) return;
    ratingStars = Number(b.dataset.v);
    $$(".js-star").forEach((s) => s.classList.toggle("on", Number((s as HTMLElement).dataset.v) <= ratingStars));
  });
  $(".js-rate-send").addEventListener("click", () => void submitRating());

  const qy = query(collection(db, "sessions"), where("active", "==", true));
  const unsub = onSnapshot(qy, (snap) => {
    const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as ClassSession));
    currentSession = list.find((s) => s.className === profile?.className) ?? null;
    if (currentSession) subscribeContents(currentSession.id);
    paintDevices();
  });
  viewListeners.push(unsub);
}

function subscribeContents(sid: string) {
  if (contentUnsub && contentSessionId === sid) return;
  if (contentUnsub) contentUnsub();
  contentSessionId = sid;
  const qy = query(collection(db, "contents"), orderBy("createdAt", "desc"), limit(20));
  contentUnsub = onSnapshot(qy, (snap) => {
    const items = snap.docs.map((d) => ({ id: d.id, ...d.data() })).filter((it) => it["sessionId"] === sid);
    latestTests = items
      .filter((it) => it["type"] === "test" && it["quiz"])
      .map((it) => ({ quiz: it["quiz"] as Quiz, sessionId: sid }));
    const box = document.getElementById("tab-content");
    if (!box) return;
    box.innerHTML = items.map((it) => {
      const t = String(it["type"]);
      if (t === "test") {
        const idx = latestTests.findIndex((x) => x.quiz.question === String(it["text"]));
        return `<div class="content-item test"><b>🧪 Class Test</b><p>${esc(it["text"])}</p>
          <button class="btn btn-primary js-open-test" data-idx="${idx}" type="button">Open Test</button></div>`;
      }
      if (t === "video") {
        return `<div class="content-item"><b>🎬 Video from teacher</b>
          <a href="${esc(it["text"])}" target="_blank" rel="noopener">${esc(it["text"])}</a></div>`;
      }
      return `<div class="content-item"><b>📒 Note from teacher</b><p>${esc(it["text"])}</p></div>`;
    }).join("") || `<p class="muted">No content pushed yet.</p>`;
    box.querySelectorAll(".js-open-test").forEach((b) =>
      b.addEventListener("click", () => {
        const t = latestTests[Number((b as HTMLElement).dataset.idx)];
        if (t) showQuizModal(t.quiz, 10, "Class Test", t.sessionId);
      }));
  });
  viewListeners.push(contentUnsub);
}

function paintDevices() {
  const tabBody = $("#tab-body");
  const hwBody = $("#hw-body");
  const hoodBody = $("#hood-body");
  const rateCard = $("#rate-card");

  if (!currentSession) {
    tabBody.innerHTML = `<p class="muted">No live class for your class right now. Your teacher starts the class from the Teacher's Hood.</p>`;
    hwBody.innerHTML = `<p class="muted">Hardware idle — waiting for a session.</p>`;
    hoodBody.innerHTML = `<p class="conn off">🔴 Teacher is NOT logged in to the Hood</p>`;
    rateCard.classList.add("hidden");
    return;
  }

  /* TAB */
  tabBody.innerHTML = `
    <p class="conn ${tabConnected ? "on" : "off"}">${tabConnected ? "🟢 Connected to Hardware" : "🔴 Not connected"}</p>
    ${tabConnected
      ? `<button class="btn js-tab-disconnect" type="button">Disconnect</button>`
      : `<button class="btn btn-primary js-tab-connect" type="button">🔗 Connect to Hardware</button>`}
    <div class="content-stream" id="tab-content"><p class="muted">No content pushed yet.</p></div>`;
  tabBody.querySelector(".js-tab-connect")?.addEventListener("click", () => void connectTab());
  tabBody.querySelector(".js-tab-disconnect")?.addEventListener("click", () => {
    tabConnected = false;
    hwLog.push(`⚠️ ${profile?.name ?? "Student"} disconnected from Hardware`);
    paintDevices();
  });

  /* HARDWARE */
  hwBody.innerHTML = `
    <div class="profile-row"><span>Teacher</span><b>${esc(currentSession.teacherName)}</b></div>
    <div class="profile-row"><span>Subject</span><b>${esc(currentSession.subject)}</b></div>
    <div class="profile-row"><span>Started</span><b>${timeAgo(currentSession.startedAt)}</b></div>
    <div class="profile-row"><span>Your attendance</span><b>${tabConnected ? "✅ Present (Tab–Hardware)" : "⏳ Pending"}</b></div>
    <button class="btn js-hw-quiz" type="button">Simulate: student not listening → pop quiz</button>
    <h4>Activity log</h4>
    <ul class="hw-log">${hwLog.slice(-6).map((l) => `<li>${esc(l)}</li>`).join("") || `<li class="muted">No activity yet.</li>`}</ul>`;
  hwBody.querySelector(".js-hw-quiz")!.addEventListener("click", () => void popHardwareQuiz());

  /* HOOD */
  hoodBody.innerHTML = `
    <p class="conn on">🟢 Teacher logged in to Hood — session LIVE</p>
    <div class="profile-row"><span>Teacher attendance</span><b>✅ Marked (Hood login)</b></div>
    <p class="hint" style="margin-top:8px">Teacher can push notes, videos and class tests to your Tab from the Hood.</p>`;

  rateCard.classList.remove("hidden");
}

async function connectTab() {
  if (!profile || !currentSession) return;
  const me = profile;
  const session = currentSession;
  const today = todayStr();
  const snap = await getDocs(query(collection(db, "attendance"), where("date", "==", today)));
  const already = snap.docs.some((d) => d.data().uid === me.uid && d.data().sessionId === session.id);
  if (!already) {
    await addDoc(collection(db, "attendance"), {
      date: today, uid: me.uid, name: me.name, role: "student", status: "present",
      method: "tab-hardware", sessionId: session.id, createdAt: Date.now(),
    });
  }
  tabConnected = true;
  hwLog.push(`✅ ${me.name}: Tab linked to Hardware — attendance marked (distance OK)`);
  paintDevices();
  showToast("Attendance marked via Tab ⇄ Hardware link ✅");
}

async function submitRating() {
  if (!profile || !currentSession) { showToast("No live class to rate", "error"); return; }
  if (ratingStars === 0) { showToast("Pick a star rating first", "error"); return; }
  const session = currentSession;
  const comment = $<HTMLTextAreaElement>(".js-rate-comment").value.trim();
  await addDoc(collection(db, "ratings"), {
    teacherUid: session.teacherUid, teacherName: session.teacherName,
    studentUid: profile.uid, studentName: profile.name,
    stars: ratingStars, comment, createdAt: Date.now(),
  });
  $<HTMLTextAreaElement>(".js-rate-comment").value = "";
  showToast("Thanks for rating! ⭐");
}

/* ================= QUIZ MODAL (Hardware pop-up + practice + tests) ================= */
function showQuizModal(quiz: Quiz, points: number, exam: string, sessionId = "") {
  quizState = { quiz, points, exam, sessionId, selected: -1 };
  $("#quiz-meta").textContent = `${exam} · +${points} Air Score for a correct answer`;
  $("#quiz-question").textContent = quiz.question;
  $("#quiz-options").innerHTML = quiz.options
    .map((o, i) => `<button class="opt" data-i="${i}" type="button">${esc(o)}</button>`).join("");
  $("#quiz-modal").classList.remove("hidden");
}

async function popHardwareQuiz() {
  const qs = await getQuizzes();
  const q = qs[Math.floor(Math.random() * qs.length)]!;
  hwLog.push(`🔔 Hardware detected inattention → quiz popped on Tab`);
  paintDevices();
  showQuizModal(q, 5, "Hardware Attention Check");
}

/* ================= 3 · OFF CLASS (student) ================= */
async function renderOffclass() {
  if (!profile) return;
  const root = $("#offclass-root");
  root.innerHTML = `
    <div class="subtabs">
      <button class="subtab active" data-t="hw" type="button">📘 H.W / Assignments</button>
      <button class="subtab" data-t="marks" type="button">📊 Marks</button>
      <button class="subtab" data-t="quiz" type="button">🧠 Practice & Quiz</button>
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

async function paintOff(tab: string, body: HTMLElement) {
  body.innerHTML = `<div class="loading">Loading…</div>`;
  if (tab === "hw") {
    const snap = await getDocs(query(collection(db, "assignments"), orderBy("createdAt", "desc"), limit(50)));
    body.innerHTML = snap.docs.map((d) => {
      const v = d.data();
      return `<div class="card"><h3>📘 ${esc(v.title)}</h3>
        <p class="muted">Subject: ${esc(v.subject ?? "—")} · Due: ${esc(v.dueDate ?? "—")} · posted by ${esc(v.by ?? "Teacher")}</p></div>`;
    }).join("") || `<p class="muted">No assignments yet.</p>`;
  } else if (tab === "marks") {
    const snap = await getDocs(query(collection(db, "marks"), where("studentUid", "==", profile!.uid)));
    const rows = snap.docs.map((d) => d.data()).sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
    body.innerHTML = rows.length ? `
      <div class="card"><table class="table">
        <thead><tr><th>Exam</th><th>Subject</th><th>Score</th><th>Date</th></tr></thead>
        <tbody>${rows.map((m) => `<tr>
          <td>${esc(m.exam)}</td><td>${esc(m.subject)}</td>
          <td>${String(m.score)} / ${String(m.total)}</td>
          <td>${new Date(Number(m.createdAt)).toLocaleDateString()}</td></tr>`).join("")}
        </tbody></table></div>`
      : `<p class="muted">No marks yet. Attempt class tests & quizzes to build your record.</p>`;
  } else {
    const qs = await getQuizzes();
    body.innerHTML = qs.map((q, i) => `
      <div class="card"><h3>${esc(q.question)}</h3><p class="muted">${esc(q.subject)}</p>
      <button class="btn btn-primary js-attempt" data-i="${i}" type="button">Attempt</button></div>`).join("")
      || `<p class="muted">No quizzes available.</p>`;
    body.querySelectorAll(".js-attempt").forEach((b) =>
      b.addEventListener("click", () => {
        const q = qs[Number((b as HTMLElement).dataset.i)]!;
        showQuizModal(q, 5, "Practice Quiz");
      }));
  }
}

/* ================= 4 · SOCIAL FEED (Student / Teacher LinkedIn) ================= */
function renderSocial() {
  if (!profile) return;
  const root = $("#social-root");
  root.innerHTML = `
    <div class="card">
      <h3>${profile.role === "teacher" ? "💼 Teacher LinkedIn" : "💼 Student LinkedIn"}</h3>
      <textarea class="js-post-text" rows="3" placeholder="Share something with your network…"></textarea>
      <button class="btn btn-primary js-post-btn" type="button">Post</button>
    </div>
    <div id="feed"></div>`;
  root.querySelector(".js-post-btn")!.addEventListener("click", () => void (async () => {
    const ta = $<HTMLTextAreaElement>(".js-post-text");
    const content = ta.value.trim();
    if (!content) { showToast("Write something first", "error"); return; }
    await addDoc(collection(db, "feed"), {
      authorUid: profile!.uid, authorName: profile!.name, role: profile!.role,
      content, likes: [], createdAt: Date.now(),
    });
    ta.value = "";
    showToast("Posted! 🚀");
  })());

  const qy = query(collection(db, "feed"), orderBy("createdAt", "desc"), limit(50));
  const unsub = onSnapshot(qy, (snap) => {
    const feed = $("#feed");
    feed.innerHTML = snap.docs.map((d) => {
      const p = d.data();
      const likes = (p.likes as string[]) ?? [];
      const liked = likes.includes(profile!.uid);
      return `<div class="card post">
        <div class="post-head"><b>${esc(p.authorName)}</b>
          <span class="badge">${esc(p.role)}</span>
          <span class="muted">${timeAgo(Number(p.createdAt))}</span></div>
        <p>${esc(p.content)}</p>
        <button class="btn btn-ghost js-like" data-id="${d.id}" type="button">${liked ? "❤️" : "🤍"} ${likes.length}</button>
      </div>`;
    }).join("") || `<p class="muted">No posts yet. Be the first!</p>`;
    feed.querySelectorAll(".js-like").forEach((b) =>
      b.addEventListener("click", () => void toggleLike((b as HTMLElement).dataset.id!)));
  });
  viewListeners.push(unsub);
}

async function toggleLike(id: string) {
  if (!profile) return;
  const ref = doc(db, "feed", id);
  const snap = await getDoc(ref);
  const likes = ((snap.data()?.likes as string[]) ?? []);
  if (likes.includes(profile.uid)) await updateDoc(ref, { likes: arrayRemove(profile.uid) });
  else await updateDoc(ref, { likes: arrayUnion(profile.uid) });
}

/* ================= 5 · DOUBTS (post + solve) ================= */
function renderDoubts() {
  if (!profile) return;
  const root = $("#doubts-root");
  if (profile.role === "student") {
    root.innerHTML = `
      <div class="card">
        <h3>❓ Post a Doubt</h3>
        <input class="js-d-subject" placeholder="Subject (e.g., Mathematics)" />
        <textarea class="js-d-question" rows="3" placeholder="What is your doubt?"></textarea>
        <button class="btn btn-primary js-d-post" type="button">Post Doubt</button>
      </div>
      <h3>My Doubts</h3>
      <div id="doubt-list"></div>`;
    root.querySelector(".js-d-post")!.addEventListener("click", () => void (async () => {
      const subject = $<HTMLInputElement>(".js-d-subject").value.trim();
      const question = $<HTMLTextAreaElement>(".js-d-question").value.trim();
      if (!subject || !question) { showToast("Fill subject and question", "error"); return; }
      await addDoc(collection(db, "doubts"), {
        studentUid: profile!.uid, studentName: profile!.name, subject, question,
        status: "open", createdAt: Date.now(),
      });
      $<HTMLTextAreaElement>(".js-d-question").value = "";
      showToast("Doubt posted — a teacher will answer soon ✅");
    })());
  } else {
    root.innerHTML = `<h3>❓ Doubt Solve — questions from students</h3><div id="doubt-list"></div>`;
  }

  const qy = query(collection(db, "doubts"), orderBy("createdAt", "desc"), limit(100));
  const unsub = onSnapshot(qy, (snap) => {
    let docs = snap.docs;
    if (profile!.role === "student") docs = docs.filter((d) => d.data().studentUid === profile!.uid);
    const list = $("#doubt-list");
    list.innerHTML = docs.map((d) => {
      const v = d.data();
      return `<div class="card doubt ${v.status}">
        <div class="post-head"><b>${esc(v.studentName)}</b>
          <span class="badge">${esc(v.subject)}</span>
          <span class="badge ${v.status === "solved" ? "green" : "orange"}">${esc(v.status)}</span>
          <span class="muted">${timeAgo(Number(v.createdAt))}</span></div>
        <p><b>Q:</b> ${esc(v.question)}</p>
        ${v.status === "solved"
          ? `<p class="answer"><b>✅ ${esc(v.answeredBy ?? "Teacher")}:</b> ${esc(v.answer ?? "")}</p>`
          : profile!.role === "teacher"
            ? `<textarea class="js-answer" rows="2" placeholder="Write your answer…"></textarea>
               <button class="btn btn-primary js-answer-btn" data-id="${d.id}" type="button">Send Answer</button>`
            : ""}
      </div>`;
    }).join("") || `<p class="muted">No doubts yet.</p>`;

    if (profile!.role === "teacher") {
      list.querySelectorAll(".js-answer-btn").forEach((b) =>
        b.addEventListener("click", () => void (async () => {
          const card = (b as HTMLElement).closest(".doubt")!;
          const ta = card.querySelector(".js-answer") as HTMLTextAreaElement;
          const answer = ta.value.trim();
          if (!answer) return;
          await updateDoc(doc(db, "doubts", (b as HTMLElement).dataset.id!), {
            status: "solved", answer, answeredBy: profile!.name, answeredAt: Date.now(),
          });
          showToast("Answer sent ✅");
        })()));
    }
  });
  viewListeners.push(unsub);
}

/* ================= 6 · DISPLAY PROJECT (student) ================= */
function renderProjects() {
  if (!profile) return;
  const root = $("#projects-root");
  root.innerHTML = `
    <div class="card">
      <h3>🛠️ Display Project</h3>
      <input class="js-p-title" placeholder="Project title" />
      <textarea class="js-p-desc" rows="2" placeholder="Describe your project…"></textarea>
      <input class="js-p-link" placeholder="Link (optional — GitHub, video…)" />
      <button class="btn btn-primary js-p-add" type="button">Publish Project</button>
    </div>
    <div id="project-list" class="grid-2"></div>`;
  root.querySelector(".js-p-add")!.addEventListener("click", () => void (async () => {
    const title = $<HTMLInputElement>(".js-p-title").value.trim();
    const description = $<HTMLTextAreaElement>(".js-p-desc").value.trim();
    const link = $<HTMLInputElement>(".js-p-link").value.trim();
    if (!title) { showToast("Title is required", "error"); return; }
    await addDoc(collection(db, "projects"), {
      studentUid: profile!.uid, studentName: profile!.name, title, description, link,
      likedBy: [], createdAt: Date.now(),
    });
    $<HTMLInputElement>(".js-p-title").value = "";
    $<HTMLTextAreaElement>(".js-p-desc").value = "";
    $<HTMLInputElement>(".js-p-link").value = "";
    showToast("Project published 🎉");
  })());

  const qy = query(collection(db, "projects"), orderBy("createdAt", "desc"), limit(50));
  const unsub = onSnapshot(qy, (snap) => {
    const list = $("#project-list");
    list.innerHTML = snap.docs.map((d) => {
      const p = d.data();
      const likedBy = (p.likedBy as string[]) ?? [];
      const liked = likedBy.includes(profile!.uid);
      return `<div class="card">
        <h3>${esc(p.title)}</h3>
        <p>${esc(p.description ?? "")}</p>
        ${p.link ? `<a href="${esc(p.link)}" target="_blank" rel="noopener">🔗 Open link</a>` : ""}
        <div class="post-head" style="margin-top:8px">
          <small class="muted">by <b>${esc(p.studentName)}</b> · ${timeAgo(Number(p.createdAt))}</small>
          <button class="btn btn-ghost js-plike" data-id="${d.id}" type="button">${liked ? "❤️" : "🤍"} ${likedBy.length}</button>
        </div>
      </div>`;
    }).join("") || `<p class="muted">No projects yet.</p>`;
    list.querySelectorAll(".js-plike").forEach((b) =>
      b.addEventListener("click", () => void (async () => {
        const ref = doc(db, "projects", (b as HTMLElement).dataset.id!);
        const s = await getDoc(ref);
        const likedBy = ((s.data()?.likedBy as string[]) ?? []);
        if (likedBy.includes(profile!.uid)) await updateDoc(ref, { likedBy: arrayRemove(profile!.uid) });
        else await updateDoc(ref, { likedBy: arrayUnion(profile!.uid) });
      })()));
  });
  viewListeners.push(unsub);
}

/* ================= TEACHER · CLASS ROOM (Teacher's Hood) ================= */
async function renderClassroom() {
  if (!profile || profile.role !== "teacher") return;
  const root = $("#classroom-root");
  root.innerHTML = `<div class="loading">Loading your class…</div>`;
  const snap = await getDocs(query(collection(db, "sessions"), where("active", "==", true)));
  const mine = snap.docs.map((d) => ({ id: d.id, ...(d.data() as object) } as ClassSession))
    .find((s) => s.teacherUid === profile!.uid);
  if (mine) { paintHoodLive(mine); return; }

  root.innerHTML = `
    <div class="card">
      <h3>🎓 Teacher's Hood — Start a class</h3>
      <p class="hint">Logging in to the Hood starts the session: Hardware marks YOUR attendance, and student Tabs get interlinked automatically.</p>
      <div class="role-fields">
        <label>Subject <input class="js-hood-subject" value="${esc(profile.subject ?? "")}" /></label>
        <label>Class <input class="js-hood-class" value="${esc(profile.className ?? "")}" placeholder="Class 10-A" /></label>
      </div>
      <br />
      <button class="btn btn-primary js-hood-start" type="button">🟢 Start Class (Hood Login)</button>
    </div>`;
  root.querySelector(".js-hood-start")!.addEventListener("click", () => void startClass());
}

async function startClass() {
  if (!profile) return;
  const subject = $<HTMLInputElement>(".js-hood-subject").value.trim() || profile.subject || "General";
  const className = $<HTMLInputElement>(".js-hood-class").value.trim() || profile.className || "Class 10-A";
  const ref = await addDoc(collection(db, "sessions"), {
    teacherUid: profile.uid, teacherName: profile.name, subject, className,
    startedAt: Date.now(), active: true,
  });
  // Hardware marks teacher attendance via Hood login (dedupe per day)
  const today = todayStr();
  const asnap = await getDocs(query(collection(db, "attendance"), where("date", "==", today)));
  const already = asnap.docs.some((d) => d.data().uid === profile!.uid && d.data().method === "hood-login");
  if (!already) {
    await addDoc(collection(db, "attendance"), {
      date: today, uid: profile.uid, name: profile.name, role: "teacher",
      status: "present", method: "hood-login", sessionId: ref.id, createdAt: Date.now(),
    });
  }
  showToast("Class started — Hood attendance marked ✅");
  paintHoodLive({ id: ref.id, teacherUid: profile.uid, teacherName: profile.name, subject, className, startedAt: Date.now(), active: true });
}

function paintHoodLive(s: ClassSession) {
  const root = $("#classroom-root");
  root.innerHTML = `
    <div class="live-banner">🔴 LIVE — ${esc(s.subject)} · ${esc(s.className)} · started ${timeAgo(s.startedAt)}</div>
    <div class="grid-2">
      <div class="card">
        <h3>📤 Push content to student Tabs</h3>
        <select class="js-c-type"><option value="note">📒 Note</option><option value="video">🎬 Video link</option></select>
        <textarea class="js-c-text" rows="2" placeholder="Note text or video URL"></textarea>
        <button class="btn btn-primary js-c-send" type="button">Push to Tab</button>
        <hr style="margin:14px 0" />
        <h3>📘 Post assignment / H.W</h3>
        <input class="js-a-title" placeholder="Assignment title" />
        <input class="js-a-due" type="date" />
        <button class="btn js-a-add" type="button">Post Assignment</button>
      </div>
      <div class="card">
        <h3>🧪 Class test</h3>
        <p class="hint" style="margin-bottom:8px">Pick a question — it pops on all connected Tabs. Hardware records marks.</p>
        <div class="js-quiz-pick"><span class="muted">Loading quizzes…</span></div>
        <hr style="margin:14px 0" />
        <h3>🖥️ Hardware panel</h3>
        <p class="muted" style="margin-bottom:8px">🟢 No abnormal teacher activity detected · session monitored</p>
        <button class="btn js-hw-syllabus" type="button">🤖 Run Hardware AI syllabus check (today)</button>
        <h4>Today's attendance (Hardware log)</h4>
        <div class="js-att-list muted">Loading…</div>
        <hr style="margin:14px 0" />
        <button class="btn btn-danger js-hood-end" type="button">⏹ End class</button>
      </div>
    </div>`;
  wireHoodEvents(s);
}

function wireHoodEvents(s: ClassSession) {
  const root = $("#classroom-root");
  root.querySelector(".js-c-send")!.addEventListener("click", () => void (async () => {
    const type = $<HTMLSelectElement>(".js-c-type").value;
    const text = $<HTMLTextAreaElement>(".js-c-text").value.trim();
    if (!text) { showToast("Write something to push", "error"); return; }
    await addDoc(collection(db, "contents"), { sessionId: s.id, type, text, createdAt: Date.now() });
    $<HTMLTextAreaElement>(".js-c-text").value = "";
    showToast("Pushed to student Tabs 📱");
  })());

  root.querySelector(".js-a-add")!.addEventListener("click", () => void (async () => {
    const title = $<HTMLInputElement>(".js-a-title").value.trim();
    const due = $<HTMLInputElement>(".js-a-due").value;
    if (!title) { showToast("Assignment title required", "error"); return; }
    await addDoc(collection(db, "assignments"), {
      title, dueDate: due, subject: s.subject, className: s.className, by: profile?.name, createdAt: Date.now(),
    });
    $<HTMLInputElement>(".js-a-title").value = "";
    showToast("Assignment posted 📘");
  })());

  root.querySelector(".js-hood-end")!.addEventListener("click", () => void (async () => {
    await updateDoc(doc(db, "sessions", s.id), { active: false });
    showToast("Class ended. Great work! 👏");
    await renderClassroom();
  })());

  root.querySelector(".js-hw-syllabus")!.addEventListener("click", () => void (async () => {
    const snap = await getDocs(query(collection(db, "syllabus"), where("date", "==", todayStr())));
    const pending = snap.docs.filter((d) => !d.data().doneByAI);
    await Promise.all(pending.map((d) => updateDoc(d.ref, { doneByAI: true })));
    showToast(`🤖 Hardware AI verified ${pending.length} topic(s) for today`);
  })());

  const attBox = root.querySelector(".js-att-list") as HTMLElement;
  void getDocs(query(collection(db, "attendance"), where("date", "==", todayStr()))).then((snap) => {
    attBox.innerHTML = `<ul style="list-style:none">${snap.docs.map((d) => {
      const v = d.data();
      return `<li style="padding:4px 0;border-bottom:1px dashed #eef0f6">${esc(v.name)} — <b>${esc(v.status)}</b> <span class="muted">(${esc(v.method)})</span></li>`;
    }).join("") || `<li>No entries yet.</li>`}</ul>`;
  });

  const pick = root.querySelector(".js-quiz-pick") as HTMLElement;
  void getQuizzes().then((qs) => {
    pick.innerHTML = qs.map((q, i) => `
      <div class="quiz-row"><span>${esc(q.question)}</span>
      <button class="btn js-send-test" data-i="${i}" type="button">Send to Tabs</button></div>`).join("");
    pick.querySelectorAll(".js-send-test").forEach((b) =>
      b.addEventListener("click", () => void (async () => {
        const quiz = qs[Number((b as HTMLElement).dataset.i)]!;
        await addDoc(collection(db, "contents"), {
          sessionId: s.id, type: "test", text: quiz.question,
          quiz: { question: quiz.question, options: quiz.options, correctIndex: quiz.correctIndex, subject: quiz.subject },
          createdAt: Date.now(),
        });
        showToast("Test sent to Tabs 🧪");
      })()));
  });
}

/* ================= TEACHER · TIME TABLE (calendar + syllabus AI check) ================= */
function renderTimetable() {
  if (!profile) return;
  selectedDate = todayStr();
  const root = $("#timetable-root");
  root.innerHTML = `
    <div class="grid-2">
      <div class="card">
        <div class="cal-head">
          <button class="btn btn-ghost js-cal-prev" type="button">‹</button>
          <h3 id="cal-title"></h3>
          <button class="btn btn-ghost js-cal-next" type="button">›</button>
        </div>
        <div class="cal-grid" id="cal-grid"></div>
      </div>
      <div class="card"><h3 id="day-title"></h3><div id="day-body"></div></div>
    </div>`;
  $(".js-cal-prev").addEventListener("click", () => { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } paintCalendar(); });
  $(".js-cal-next").addEventListener("click", () => { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } paintCalendar(); });
  void refreshTimetableData();
}

async function refreshTimetableData() {
  const snap = await getDocs(collection(db, "syllabus"));
  topicsByDate = {};
  snap.docs.forEach((d) => {
    const v = d.data();
    const arr = topicsByDate[String(v.date)] ?? [];
    arr.push({ id: d.id, ...(v as object) } as SyllabusTopic);
    topicsByDate[String(v.date)] = arr;
  });
  paintCalendar();
  void paintDay();
}

function paintCalendar() {
  const grid = $("#cal-grid");
  const monthName = new Date(calYear, calMonth, 1).toLocaleString("en", { month: "long" });
  $("#cal-title").textContent = `${monthName} ${calYear}`;
  const startDow = new Date(calYear, calMonth, 1).getDay();
  const days = new Date(calYear, calMonth + 1, 0).getDate();
  let html = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => `<div class="cal-dow">${d}</div>`).join("");
  for (let i = 0; i < startDow; i++) html += `<div></div>`;
  for (let d = 1; d <= days; d++) {
    const iso = `${calYear}-${String(calMonth + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    const count = (topicsByDate[iso] ?? []).length;
    html += `<button class="cal-day ${iso === selectedDate ? "sel" : ""}" data-date="${iso}" type="button">${d}${count ? `<span class="dot">${count}</span>` : ""}</button>`;
  }
  grid.innerHTML = html;
  grid.querySelectorAll(".cal-day").forEach((b) =>
    b.addEventListener("click", () => {
      selectedDate = (b as HTMLElement).dataset.date!;
      paintCalendar();
      void paintDay();
    }));
}

async function paintDay() {
  const bodyEl = $("#day-body");
  $("#day-title").textContent = `🗓️ Syllabus — ${selectedDate}`;
  const topics = topicsByDate[selectedDate] ?? [];
  bodyEl.innerHTML = `
    ${topics.map((t) => `
      <div class="topic-row">
        <label><input type="checkbox" class="js-t-done" data-id="${t.id}" ${t.doneByTeacher ? "checked" : ""}/> ${esc(t.topic)}</label>
        ${t.doneByAI ? `<span class="badge green">🤖 AI verified</span>` : `<span class="badge muted">AI pending</span>`}
      </div>`).join("") || `<p class="muted">No topics planned for this date. Click a date on the calendar → syllabus checkboxes appear here.</p>`}
    <div class="add-topic">
      <input class="js-topic-text" placeholder="Add syllabus topic for this date" />
      <button class="btn btn-primary js-topic-add" type="button">Add</button>
      <button class="btn js-ai-check" type="button">🤖 Hardware AI check</button>
    </div>`;

  bodyEl.querySelectorAll(".js-t-done").forEach((cb) =>
    cb.addEventListener("change", () => void (async () => {
      await updateDoc(doc(db, "syllabus", (cb as HTMLInputElement).dataset.id!), { doneByTeacher: (cb as HTMLInputElement).checked });
      showToast("Syllabus updated ✅ (AI/hardware will verify coverage)");
      await refreshTimetableData();
    })()));

  bodyEl.querySelector(".js-topic-add")!.addEventListener("click", () => void (async () => {
    const input = $<HTMLInputElement>(".js-topic-text", bodyEl);
    const topic = input.value.trim();
    if (!topic) return;
    await addDoc(collection(db, "syllabus"), {
      date: selectedDate, subject: profile?.subject ?? "General", topic,
      doneByTeacher: false, doneByAI: false, createdAt: Date.now(),
    });
    input.value = "";
    await refreshTimetableData();
  })());

  bodyEl.querySelector(".js-ai-check")!.addEventListener("click", () => void (async () => {
    const list = topicsByDate[selectedDate] ?? [];
    await Promise.all(list.filter((t) => !t.doneByAI).map((t) => updateDoc(doc(db, "syllabus", t.id), { doneByAI: true })));
    showToast(`🤖 Hardware AI verified ${list.length} topic(s)`);
    await refreshTimetableData();
  })());
}

/* ================= HM / MEO / DEO · OVERVIEW ================= */
async function renderAdmin() {
  const root = $("#admin-root");
  root.innerHTML = `<div class="loading">Loading overview…</div>`;
  const usersSnap = await getDocs(collection(db, "users"));
  const users = usersSnap.docs.map((d) => d.data() as UserProfile);
  const students = users.filter((u) => u.role === "student");
  const teachers = users.filter((u) => u.role === "teacher");
  const top = [...students].sort((a, b) => (b.airScore ?? 0) - (a.airScore ?? 0)).slice(0, 5);
  const attSnap = await getDocs(query(collection(db, "attendance"), where("date", "==", todayStr())));
  const doubtsSnap = await getDocs(collection(db, "doubts"));
  const openDoubts = doubtsSnap.docs.filter((d) => d.data().status === "open").length;

  root.innerHTML = `
    <div class="stat-grid">
      <div class="card stat"><h3>${students.length}</h3><p class="muted">Students</p></div>
      <div class="card stat"><h3>${teachers.length}</h3><p class="muted">Teachers</p></div>
      <div class="card stat"><h3>${openDoubts}</h3><p class="muted">Open doubts</p></div>
      <div class="card stat"><h3>${attSnap.size}</h3><p class="muted">Attendance entries today</p></div>
    </div>
    <div class="grid-2">
      <div class="card"><h3>🏆 Top students (Air Score)</h3>
        <ol class="leaderboard">${top.map((s, i) => `
          <li><span class="rank">${["🥇", "🥈", "🥉"][i] ?? "#" + (i + 1)}</span>
          <span class="name">${esc(s.name)}</span><span class="score">${s.airScore ?? 0}</span></li>`).join("")
          || `<li class="muted">No students yet.</li>`}</ol>
      </div>
      <div class="card"><h3>📋 Today's attendance</h3>
        <ul style="list-style:none">${attSnap.docs.map((d) => {
          const v = d.data();
          return `<li style="padding:6px 0;border-bottom:1px dashed #eef0f6">${esc(v.name)} — <b>${esc(v.status)}</b> <span class="muted">(${esc(v.method)})</span></li>`;
        }).join("") || `<li class="muted">No entries today.</li>`}</ul>
      </div>
    </div>`;
}

/* ================= quiz modal wiring ================= */
 $("#quiz-options").addEventListener("click", (e) => {
  const btn = (e.target as HTMLElement).closest(".opt") as HTMLElement | null;
  if (!btn) return;
  $$("#quiz-options .opt").forEach((b) => b.classList.remove("selected"));
  btn.classList.add("selected");
  quizState.selected = Number(btn.dataset.i);
});

 $("#quiz-close").addEventListener("click", () => { $("#quiz-modal").classList.add("hidden"); quizState.quiz = null; });

 $("#quiz-submit").addEventListener("click", () => {
  const quiz = quizState.quiz;
  const selected = quizState.selected;
  if (!quiz || selected < 0) { showToast("Select an answer first", "error"); return; }
  const correct = selected === quiz.correctIndex;
  const points = quizState.points;
  const exam = quizState.exam;
  const sessionId = quizState.sessionId;
  quizState.quiz = null;
  $("#quiz-modal").classList.add("hidden");
  void (async () => {
    const gained = correct ? points : 1;
    if (profile) {
      await updateDoc(doc(db, "users", profile.uid), { airScore: increment(gained) });
      profile.airScore = (profile.airScore ?? 0) + gained;
    }
    if (sessionId && profile) {
      await addDoc(collection(db, "marks"), {
        studentUid: profile.uid, studentName: profile.name, sessionId,
        subject: quiz.subject, exam, score: correct ? 1 : 0, total: 1, createdAt: Date.now(),
      });
    }
    showToast(correct ? `✅ Correct! +${gained} Air Score` : `❌ Wrong — +${gained} for participation`, correct ? "success" : "error");
  })();
});

/* ================= auth forms wiring ================= */
function switchAuth(which: "login" | "register") {
  $("#tab-login").classList.toggle("active", which === "login");
  $("#tab-register").classList.toggle("active", which === "register");
  $("#login-form").classList.toggle("hidden", which !== "login");
  $("#register-form").classList.toggle("hidden", which !== "register");
  $("#auth-title").textContent = which === "login" ? "Welcome back" : "Create your account";
}
 $("#tab-login").addEventListener("click", () => switchAuth("login"));
 $("#tab-register").addEventListener("click", () => switchAuth("register"));

 $("#reg-role").addEventListener("change", () => {
  const role = $<HTMLSelectElement>("#reg-role").value;
  $("#reg-student-fields").classList.toggle("hidden", role !== "student");
  $("#reg-teacher-fields").classList.toggle("hidden", role !== "teacher");
});

 $("#login-form").addEventListener("submit", (e) => {
  e.preventDefault();
  void (async () => {
    try {
      await signInWithEmailAndPassword(auth,
        $<HTMLInputElement>("#login-email").value.trim(),
        $<HTMLInputElement>("#login-password").value);
      $("#login-error").textContent = "";
    } catch (err) {
      $("#login-error").textContent = authError(err);
    }
  })();
});

 $("#register-form").addEventListener("submit", (e) => {
  e.preventDefault();
  void (async () => {
    const name = $<HTMLInputElement>("#reg-name").value.trim();
    const email = $<HTMLInputElement>("#reg-email").value.trim();
    const password = $<HTMLInputElement>("#reg-password").value;
    const role = $<HTMLSelectElement>("#reg-role").value as Role;
    if (!name || !email || !password) return;
    const data: Record<string, unknown> = { name, email, role, airScore: 0, createdAt: Date.now() };
    if (role === "student") {
      data.studentId = $<HTMLInputElement>("#reg-student-id").value.trim() || "STU-" + Date.now();
      data.className = $<HTMLInputElement>("#reg-class").value.trim() || "Class 10-A";
    }
    if (role === "teacher") {
      data.subject = $<HTMLInputElement>("#reg-subject").value.trim() || "General";
      data.className = $<HTMLInputElement>("#reg-class-t").value.trim() || "Class 10-A";
    }
    try {
      const cred = await createUserWithEmailAndPassword(auth, email, password);
      await updateProfile(cred.user, { displayName: name });
      await setDoc(doc(db, "users", cred.user.uid), { ...data, uid: cred.user.uid });
      $("#register-error").textContent = "";
      showToast("Account created 🎉");
    } catch (err) {
      $("#register-error").textContent = authError(err);
    }
  })();
});

 $("#logout-btn").addEventListener("click", () => void signOut(auth));

/* ================= boot ================= */
if (firebaseConfig.apiKey.includes("YOUR_")) {
  document.body.insertAdjacentHTML("afterbegin",
    `<div class="config-banner">⚠️ Replace the Firebase config in src/firebase.ts with your project keys.</div>`);
}