import "./style.css";
import {
  createUserWithEmailAndPassword, deleteUser, onAuthStateChanged,
  signInWithEmailAndPassword, signOut, type User,
} from "firebase/auth";
import { doc, getDoc, onSnapshot, setDoc } from "firebase/firestore";
import { app, auth, db, isConfigured } from "./firebase";
import { state } from "./state";
import { $, authErrorMessage, esc, showToast, timeAgo } from "./helpers"; // BUG #1: $ imported
import { CLASS_LIST, SUBJECTS, createSearchableSelect, getSelectValue } from "./catalog";
import {
  clearAllNotifications, clearReadNotifications, deleteNotification,
  markAllRead, watchMyNotifications,
} from "./notify";
import { connectHardware, disconnectHardware } from "./hardware";
import { dbGet } from "./store";
import type { AppNotification, Role, UserProfile } from "./types";

if (!isConfigured) {
  document.body.innerHTML =
    `<div style="font-family:Inter,sans-serif;padding:40px;max-width:600px;margin:auto">
       <h2>⚠️ Firebase is not configured</h2>
       <p>Copy <b>.env.example</b> → <b>.env</b>, paste your 6 real VITE_FIREBASE_* values,
       then restart with <code>npm run dev</code>.</p></div>`;
  throw new Error("Firebase not configured");
}

/* ================= VIEW REGISTRY ================= */
type RenderFn = (root: HTMLElement) => void;
interface ViewDef { id: string; title: string; roles: Role[]; }
const ALL: Role[] = ["student", "teacher", "hm", "meo", "deo", "admin"];
const STAFF: Role[] = ["hm", "meo", "deo", "admin"];

const NAV: ViewDef[] = [
  { id: "studentdash", title: "Dashboard",         roles: ["student"] },
  { id: "inclass",     title: "In Class",          roles: ["student"] },
  { id: "offclass",    title: "Off Class",         roles: ["student"] },
  { id: "social",      title: "Social Feed",       roles: ALL },
  { id: "doubts",      title: "Doubt Corner",      roles: ALL },
  { id: "projects",    title: "Projects",          roles: ALL },
  { id: "leaderboard", title: "Leaderboard & AIR", roles: ALL },
  { id: "profile",     title: "My Profile",        roles: ALL },
  { id: "teacherlive", title: "Go Live",           roles: ["teacher"] },
  { id: "board",       title: "Board Snapshots",   roles: ALL },
  { id: "approvals",   title: "Quiz Approvals",    roles: ["teacher"] },
  { id: "assignments", title: "Assignments",       roles: ["student", "teacher"] },
  { id: "classroom",   title: "Classroom",         roles: ["student", "teacher"] },
  { id: "timetable",   title: "Timetable",         roles: ALL },
  { id: "hmdash",      title: "HM Dashboard",      roles: STAFF },
  { id: "hardware",    title: "Hardware Monitor",  roles: STAFF },
  { id: "alerts",      title: "Alerts",            roles: STAFF },
  { id: "incidents",   title: "Incidents",         roles: STAFF },
  { id: "hmteachers",  title: "Teachers",          roles: STAFF },
  { id: "hmstudents",  title: "Students",          roles: STAFF },
  { id: "reports",     title: "Reports",           roles: STAFF },
  { id: "audit",       title: "Audit Log",         roles: STAFF },
  { id: "config",      title: "System Config",     roles: STAFF },
  { id: "analytics",   title: "Analytics",         roles: STAFF },
];

const LOADERS: Record<string, () => Promise<unknown>> = {
  studentdash:  () => import("./views/student-dashboard"),
  inclass:      () => import("./views/inclass"),
  offclass:     () => import("./views/offclass"),
  social:       () => import("./views/social"),
  doubts:       () => import("./views/doubts"),
  projects:     () => import("./views/projects"),
  leaderboard:  () => import("./views/leaderboard"),
  profile:      () => import("./views/profile"),
  teacherlive:  () => import("./views/teacher-live"),
  board:        () => import("./views/board"),
  approvals:    () => import("./views/quiz-approvals"),
  assignments:  () => import("./views/assignments"),
  classroom:    () => import("./views/classroom"),
  timetable:    () => import("./views/timetable"),
  hmdash:       () => import("./views/hm-dashboard"),
  hardware:     () => import("./views/hm-hardware"),
  alerts:       () => import("./views/hm-alerts"),
  incidents:    () => import("./views/hm-incidents"),
  hmteachers:   () => import("./views/hm-teachers"),
  hmstudents:   () => import("./views/hm-students"),
  reports:      () => import("./views/hm-reports"),
  audit:        () => import("./views/hm-audit"),
  config:       () => import("./views/hm-config"),
  analytics:    () => import("./views/analytics"),
};

/** BUG #2: prefer exports whose name starts with "render" — never random. */
function pickRender(mod: unknown): RenderFn {
  const m = mod as Record<string, unknown>;
  const named = Object.entries(m).find(
    ([k, v]) => typeof v === "function" && k.toLowerCase().startsWith("render"),
  );
  if (named) return named[1] as RenderFn;
  if (typeof m.default === "function") return m.default as RenderFn;
  throw new Error("View module has no exported render function");
}

/* ================= ROUTER (with per-view error boundary — POLISH #7) ================= */
function viewsFor(role: Role): ViewDef[] { return NAV.filter((v) => v.roles.includes(role)); }

async function navigate(id: string): Promise<void> {
  const def = NAV.find((v) => v.id === id);
  const p = state.profile;
  if (!def || !p || !def.roles.includes(p.role)) return;
  document.querySelectorAll<HTMLElement>(".view").forEach((s) => s.classList.add("hidden"));
  const section = document.getElementById("view-" + id);
  if (!section) { showToast("Missing section #view-" + id, "error"); return; }
  section.classList.remove("hidden");
  ($("#view-title") as HTMLElement).textContent = def.title;
  document.querySelectorAll<HTMLElement>(".nav-btn").forEach((b) => {
    const on = b.dataset.view === id;
    b.classList.toggle("active", on);
    if (on) b.setAttribute("aria-current", "page");
    else b.removeAttribute("aria-current");
  });
  const root = document.getElementById(id + "-root") as HTMLElement | null;
  if (!root) return;

  if (id === "hardware" && STAFF.includes(p.role)) void connectHardware();

  try {
    const mod = await LOADERS[id]();
    const render = pickRender(mod);
    try { render(root); } // second boundary: a crash inside a view can't kill the app
    catch (viewErr) {
      console.error("View render failed [" + id + "]:", viewErr);
      root.innerHTML = `<div class="card"><h3>⚠️ View failed to render</h3>
        <p class="muted">${esc((viewErr as Error).message)}</p>
        <button class="btn" onclick="location.reload()" type="button">Reload</button></div>`;
    }
  } catch (err) {
    console.error("View load error [" + id + "]:", err);
    root.innerHTML = `<div class="card"><h3>⚠️ Couldn't load “${esc(def.title)}”</h3>
      <p class="muted">${esc((err as Error).message)}</p>
      <p class="muted small">Check the browser console (F12).</p></div>`;
  }
}

/* ================= AUTH + PROFILE (instant, live, race-safe) ================= */
let pendingReg: Partial<UserProfile> | null = null;
let unsubProfile: (() => void) | null = null;
let stopBell: (() => void) | null = null;
let registrationInFlight = false; // BUG #5 race guard

function showAuth(): void {
  $("#auth-screen").classList.remove("hidden");
  $("#app").classList.add("hidden");
}

async function bootProfile(user: User): Promise<void> {
  try {
    const ref = doc(db, "users", user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      if (registrationInFlight) return; // register handler owns this account right now
      const seed = pendingReg && pendingReg.email === user.email
        ? pendingReg
        : { name: user.displayName || (user.email ?? "user").split("@")[0], email: user.email ?? "", role: "student" as Role };
      await setDoc(ref, { ...seed, uid: user.uid, airScore: 0, behaviorScore: 100, createdAt: Date.now() });
      pendingReg = null;
    }
    const fresh = await getDoc(ref);
    state.profile = { ...(fresh.data() as UserProfile), uid: user.uid };
    enterApp();
    watchProfile(user.uid);
  } catch (err) {
    console.error("Profile load failed:", err);
    showToast("Profile failed to load: " + (err as Error).message + " — check Firestore rules & connection.", "error");
    await signOut(auth).catch(() => {});
    showAuth();
  }
}

/** LIVE profile — header updates the moment the Firestore doc changes. */
function watchProfile(uid: string): void {
  unsubProfile?.();
  unsubProfile = onSnapshot(doc(db, "users", uid), (snap) => {
    if (!snap.exists()) return;
    state.profile = { ...(snap.data() as UserProfile), uid };
    ($("#user-name") as HTMLElement).textContent = state.profile.name;
    ($("#user-role") as HTMLElement).textContent = state.profile.role.toUpperCase();
  }, (err) => console.error("profile watch:", err.message));
}

/** BUG #3: live quiz watcher — teacher-approved quizzes POP on the student's screen. */
async function startStudentQuizWatcher(): Promise<void> {
  try {
    const mod = await import("./views/student-dashboard");
    if (typeof mod.watchStudentQuizzes === "function") mod.watchStudentQuizzes();
  } catch (e) { console.error("quiz watcher:", e); }
}
async function stopStudentQuizWatcher(): Promise<void> {
  try {
    const mod = await import("./views/student-dashboard");
    if (typeof mod.stopStudentQuizzes === "function") mod.stopStudentQuizzes();
  } catch { /* ignore */ }
}

/** POLISH #3: service worker (offline shell) for everyone + FCM push for staff. */
async function setupServiceWorkerAndPush(): Promise<void> {
  try {
    if (!("serviceWorker" in navigator)) return;
    const reg = await navigator.serviceWorker.register("/firebase-messaging-sw.js");
    const role = state.profile?.role;
    if (!role || !STAFF.includes(role)) return;
    if (!("Notification" in window) || Notification.permission === "denied") return;
    if (Notification.permission === "default") await Notification.requestPermission();
    if (Notification.permission !== "granted") return;
    const vapid = String(import.meta.env.VITE_FIREBASE_VAPID_KEY ?? "").trim();
    if (!vapid) { console.warn("push: set VITE_FIREBASE_VAPID_KEY in .env to enable push"); return; }
    const { getMessaging, getToken, isSupported } = await import("firebase/messaging");
    if (!(await isSupported())) return;
    const token = await getToken(getMessaging(app), { vapidKey: vapid, serviceWorkerRegistration: reg });
    const { getFunctions, httpsCallable } = await import("firebase/functions");
    await httpsCallable<{ token: string }, { ok: boolean }>(getFunctions(app), "subscribeHmPush")({ token });
    showToast("Push notifications enabled 🔔");
  } catch (e) { console.warn("push setup skipped:", e); }
}

function enterApp(): void {
  const p = state.profile!;
  $("#auth-screen").classList.add("hidden");
  $("#app").classList.remove("hidden");
  ($("#user-name") as HTMLElement).textContent = p.name;
  ($("#user-role") as HTMLElement).textContent = p.role.toUpperCase();
  buildNav();
  initBell();
  if (p.role === "student") void startStudentQuizWatcher(); // BUG #3
  if (STAFF.includes(p.role)) void setupServiceWorkerAndPush(); // POLISH #3
  if (!localStorage.getItem("nebula_banner_ok")) $("#monitor-banner").classList.remove("hidden");
  const first = viewsFor(p.role)[0];
  if (first) void navigate(first.id);
}

function buildNav(): void {
  const nav = $("#nav");
  nav.innerHTML = "";
  for (const v of viewsFor(state.profile!.role)) {
    const b = document.createElement("button");
    b.className = "nav-btn";
    b.type = "button";
    b.dataset.view = v.id;
    b.textContent = v.title;
    b.onclick = () => void navigate(v.id);
    nav.appendChild(b);
  }
}

/* ============ NOTIFICATION BELL (live · NEW vs READ · delete · clear all) ============ */
function initBell(): void {
  stopBell?.();
  const btn = $("#bell-btn"), panel = $("#bell-panel"), list = $("#bell-list"),
        count = $("#bell-count"), readAll = $("#bell-read"),
        clearRead = $("#bell-clear"), nuke = $("#bell-nuke");
  let cache: AppNotification[] = [];

  stopBell = watchMyNotifications((rows) => { cache = rows; paint(); });

  function paint(): void {
    const unread = cache.filter((n) => !n.read);
    const read = cache.filter((n) => n.read);
    if (unread.length) { count.textContent = String(unread.length); count.classList.remove("hidden"); }
    else count.classList.add("hidden");

    const row = (n: AppNotification) => `
      <div class="notif-item ${n.read ? "read" : "unread"}" data-id="${n.id}">
        <div>
          <div class="notif-title">${esc(n.title)}</div>
          <div class="notif-body">${esc(n.body)}</div>
          <div class="notif-time">${timeAgo(n.createdAt)}</div>
        </div>
        <button class="notif-del" data-del="${n.id}" title="Delete" aria-label="Delete notification" type="button">🗑</button>
      </div>`;

    list.innerHTML =
      `<div class="notif-sec">🆕 New — ${unread.length}</div>` +
      (unread.length ? unread.map(row).join("") : `<div class="notif-empty">No new notifications 🎉</div>`) +
      `<div class="notif-sec">✅ Read — ${read.length}</div>` +
      (read.length ? read.map(row).join("") : `<div class="notif-empty">Nothing read yet</div>`);
  }

  btn.onclick = (e) => { e.stopPropagation(); panel.classList.toggle("hidden"); };
  document.addEventListener("click", (e) => {
    if (!panel.classList.contains("hidden") && !panel.contains(e.target as Node) && e.target !== btn)
      panel.classList.add("hidden");
  });
  list.onclick = (e) => {
    const t = e.target as HTMLElement;
    const delBtn = t.closest("button[data-del]") as HTMLElement | null;
    if (delBtn) { void deleteNotification(delBtn.dataset.del!); return; }
    const item = t.closest(".notif-item") as HTMLElement | null;
    const id = item?.dataset.id;
    if (id) {
      const n = cache.find((x) => x.id === id);
      if (n && !n.read) void markAllRead([n]);
    }
  };
  readAll.onclick = () => void markAllRead(cache);
  clearRead.onclick = () => void clearReadNotifications(cache);
  nuke.onclick = () => void clearAllNotifications(cache);
}

/* ============ REGISTER FORM (searchable dropdowns + race-safe PIN — BUG #5) ============ */
function upgradeRegFields(): void {
  const sf = document.getElementById("reg-student-fields")!;
  const tf = document.getElementById("reg-teacher-fields")!;

  const swap = (old: Element | null, opts: typeof CLASS_LIST, ph: string) => {
    if (old) old.replaceWith(createSearchableSelect((old as HTMLInputElement).id, opts, ph));
  };
  swap(sf.querySelector("#reg-class"), CLASS_LIST, "🔍 Search class… e.g. 10-A");
  swap(tf.querySelector("#reg-subject"), SUBJECTS, "🔍 Search subject… e.g. Math");
  swap(tf.querySelector("#reg-class-t"), CLASS_LIST, "🔍 Search class… e.g. 10-A");

  const roleSel = $("#reg-role") as HTMLSelectElement;
  if (!document.getElementById("reg-pin")) {
    const l = document.createElement("label");
    l.innerHTML = 'Class PIN (optional) <input id="reg-pin" placeholder="Ask your HM — empty if your class has none" />';
    roleSel.parentElement!.after(l);
  }
  roleSel.onchange = () => {
    sf.classList.toggle("hidden", roleSel.value !== "student");
    tf.classList.toggle("hidden", roleSel.value !== "teacher");
  };
}

function initAuthUI(): void {
  const tabLogin = $("#tab-login"), tabReg = $("#tab-register");
  const fLogin = $("#login-form"), fReg = $("#register-form");
  tabLogin.onclick = () => { tabLogin.classList.add("active"); tabReg.classList.remove("active"); fLogin.classList.remove("hidden"); fReg.classList.add("hidden"); };
  tabReg.onclick = () => { tabReg.classList.add("active"); tabLogin.classList.remove("active"); fReg.classList.remove("hidden"); fLogin.classList.add("hidden"); };

  fLogin.onsubmit = async (e) => {
    e.preventDefault();
    ($("#login-error") as HTMLElement).textContent = "";
    try {
      await signInWithEmailAndPassword(auth,
        ($("#login-email") as HTMLInputElement).value.trim(),
        ($("#login-password") as HTMLInputElement).value);
    } catch (err) { ($("#login-error") as HTMLElement).textContent = authErrorMessage(err); }
  };

  fReg.onsubmit = async (e) => {
    e.preventDefault();
    const errEl = $("#register-error") as HTMLElement;
    errEl.textContent = "";
    const role = ($("#reg-role") as HTMLSelectElement).value as Role;
    const name = ($("#reg-name") as HTMLInputElement).value.trim();
    const email = ($("#reg-email") as HTMLInputElement).value.trim();
    const pass = ($("#reg-password") as HTMLInputElement).value;
    const isStudent = role === "student";
    const classId = getSelectValue(isStudent ? "reg-class" : "reg-class-t");
    const subject = role === "teacher" ? getSelectValue("reg-subject") : "";
    const pin = ($("#reg-pin") as HTMLInputElement)?.value.trim() ?? "";

    if (!name) { errEl.textContent = "Please enter your full name."; return; }
    if ((isStudent || role === "teacher") && !classId) { errEl.textContent = "Please pick your class from the dropdown."; return; }
    if (role === "teacher" && !subject) { errEl.textContent = "Please pick your subject."; return; }

    const profile: Partial<UserProfile> = {
      uid: "", name, email, role,
      ...(isStudent
        ? { studentId: "STU-" + Date.now().toString(36).toUpperCase(), className: classId }
        : { teacherId: "TCH-" + Date.now().toString(36).toUpperCase(), subject, className: classId }),
      airScore: 0, behaviorScore: 100, createdAt: Date.now(),
    };
    pendingReg = { ...profile, email };
    registrationInFlight = true; // BUG #5: guard the observer while we validate

    let cred;
    try {
      cred = await createUserWithEmailAndPassword(auth, email, pass);
    } catch (err) {
      registrationInFlight = false;
      errEl.textContent = authErrorMessage(err);
      return;
    }

    try {
      // PIN check AFTER creation (rules require sign-in to read settings) but
      // BEFORE any profile doc exists — race is eliminated by registrationInFlight.
      const pins = await dbGet<{ pins?: Record<string, string> }>("settings", "classpins");
      const need = pins?.pins?.[classId];
      if ((isStudent || role === "teacher") && need && pin !== need) {
        throw new Error("Wrong class PIN — ask your HM/teacher for the correct code.");
      }
      await setDoc(doc(db, "users", cred.user.uid), { ...profile, uid: cred.user.uid });
      registrationInFlight = false;
      showToast("Account created ✅");
      void bootProfile(cred.user); // observer already fired and returned early
    } catch (err) {
      registrationInFlight = false;
      await deleteUser(cred.user).catch(() => {});
      await signOut(auth).catch(() => {});
      pendingReg = null;
      errEl.textContent = (err as Error).message;
    }
  };
}

/* ================= BOOT ================= */
function init(): void {
  upgradeRegFields();
  initAuthUI();
  $("#logout-btn").onclick = async () => {
    disconnectHardware();
    stopBell?.(); stopBell = null;
    unsubProfile?.(); unsubProfile = null;
    await signOut(auth);
    location.reload();
  };
  $("#banner-ok").onclick = () => { localStorage.setItem("nebula_banner_ok", "1"); $("#monitor-banner").classList.add("hidden"); };
  window.addEventListener("unhandledrejection", (e) => console.error("Unhandled promise:", e.reason));
  onAuthStateChanged(auth, (user) => {
    if (!user) {
      state.profile = null;
      disconnectHardware();
      unsubProfile?.(); unsubProfile = null;
      void stopStudentQuizWatcher(); // BUG #3: stop the watcher on logout
      showAuth();
      return;
    }
    void bootProfile(user);
  });
}
init();
