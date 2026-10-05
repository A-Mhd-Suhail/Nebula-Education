import "./style.css";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, isConfigured } from "./firebase";
import { state } from "./state";
import { showToast } from "./helpers";
import { dbGet } from "./store";
import { buildNav, clearViewListeners, navItems, showView } from "./router";
import { initQuizModal } from "./quiz";
import { initAuthForms } from "./views/auth";
import { watchStudentQuizzes, stopStudentQuizzes } from "./views/student-dashboard";
import { connectHardware, disconnectHardware } from "./hardware";
import { markAllRead, watchMyNotifications } from "./notify";
import type { AppNotification, UserProfile } from "./types";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));
let notifUnsub: (() => void) | null = null;
let notifCache: AppNotification[] = [];

function showAuthScreen(): void {
  document.getElementById("app")?.classList.add("hidden");
  document.getElementById("auth-screen")?.classList.remove("hidden");
}

function wireBell(): void {
  const btn = document.getElementById("bell-btn");
  const panel = document.getElementById("bell-panel");
  const readBtn = document.getElementById("bell-read");
  btn?.addEventListener("click", () => panel?.classList.toggle("hidden"));
  readBtn?.addEventListener("click", () => void markAllRead(notifCache));
  document.addEventListener("click", (e) => {
    if (panel && !panel.classList.contains("hidden") &&
        !(e.target as HTMLElement).closest(".bell-wrap")) panel.classList.add("hidden");
  });
}

function startNotifications(): void {
  notifUnsub?.();
  notifUnsub = watchMyNotifications((list) => {
    notifCache = list;
    const unread = list.filter((n) => !n.read).length;
    const count = document.getElementById("bell-count");
    const listEl = document.getElementById("bell-list");
    if (count) {
      count.textContent = String(unread);
      count.classList.toggle("hidden", unread === 0);
    }
    if (listEl) {
      listEl.innerHTML = list.slice(0, 20).map((n) => `
        <div class="bell-item ${n.read ? "" : "unread"}">
          <b>${n.type === "critical" ? "🚨" : "🔔"} ${n.title}</b>
          <p>${n.body}</p>
          <span class="muted">${new Date(n.createdAt).toLocaleTimeString()}</span>
        </div>`).join("") || `<p class="muted" style="padding:10px">No notifications yet.</p>`;
    }
  });
}

async function handleUser(uid: string | null): Promise<void> {
  if (!uid) {
    state.profile = null;
    clearViewListeners();
    stopStudentQuizzes();
    disconnectHardware();
    notifUnsub?.(); notifUnsub = null;
    showAuthScreen();
    return;
  }
  let p = await dbGet<UserProfile>("users", uid);
  let tries = 0;
  while (!p && tries < 12) { await sleep(400); p = await dbGet<UserProfile>("users", uid); tries++; }
  if (!p) { showToast("Profile not found — please register.", "error"); await signOut(auth); return; }

  state.profile = p;
  document.getElementById("auth-screen")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("hidden");
  const nameEl = document.getElementById("user-name");
  const badgeEl = document.getElementById("user-role");
  if (nameEl) nameEl.textContent = p.name;
  if (badgeEl) { badgeEl.textContent = p.role.toUpperCase(); badgeEl.className = "badge role-" + p.role; }
  buildNav();
  showView(navItems[0]!.id);
  startNotifications();
  if (p.role === "student") watchStudentQuizzes(); else stopStudentQuizzes();
  if (p.role === "hm" || p.role === "meo" || p.role === "deo" || p.role === "admin") void connectHardware();
  else disconnectHardware();
}

/* ---- boot ---- */
initAuthForms();
initQuizModal();
wireBell();

const banner = document.getElementById("monitor-banner");
if (banner && !localStorage.getItem("nebulaBannerOk")) banner.classList.remove("hidden");
document.getElementById("banner-ok")?.addEventListener("click", () => {
  banner?.classList.add("hidden");
  localStorage.setItem("nebulaBannerOk", "1");
});

onAuthStateChanged(auth, (user) => {
  void handleUser(user ? user.uid : null).catch((err) => {
    console.error(err);
    showToast("Startup error: " + (err as Error).message, "error");
  });
});

document.getElementById("logout-btn")?.addEventListener("click", () => { void signOut(auth); });

window.addEventListener("unhandledrejection", (e) => {
  console.error(e.reason);
  showToast("Error: " + String((e as PromiseRejectionEvent).reason?.message ?? e.reason), "error");
});

if (!isConfigured) {
  document.body.insertAdjacentHTML("afterbegin",
    `<div class="config-banner">⚠️ SETUP: copy .env.example → .env, paste your Firebase keys (no quotes/spaces), then RESTART the dev server.</div>`);
}