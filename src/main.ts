import "./style.css";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth, isConfigured } from "./firebase";
import { state } from "./state";
import { showToast } from "./helpers";
import { dbGet } from "./store";
import { buildNav, clearViewListeners, navItems, showView } from "./router";
import { initQuizModal } from "./quiz";
import { initAuthForms } from "./views/auth";
import type { UserProfile } from "./types";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function showAuthScreen(): void {
  document.getElementById("app")?.classList.add("hidden");
  document.getElementById("auth-screen")?.classList.remove("hidden");
}

async function handleUser(uid: string | null): Promise<void> {
  if (!uid) {
    state.profile = null;
    clearViewListeners();
    showAuthScreen();
    return;
  }

  // Retry-wait: right after registration the users/{uid} doc may take a
  // moment to appear in Firestore. Poll for up to ~5s instead of failing.
  let p = await dbGet<UserProfile>("users", uid);
  let tries = 0;
  while (!p && tries < 12) {
    await sleep(400);
    p = await dbGet<UserProfile>("users", uid);
    tries++;
  }

  if (!p) {
    showToast("Profile not found — please register.", "error");
    await signOut(auth);
    return;
  }

  state.profile = p;
  document.getElementById("auth-screen")?.classList.add("hidden");
  document.getElementById("app")?.classList.remove("hidden");
  const nameEl = document.getElementById("user-name");
  const badgeEl = document.getElementById("user-role");
  if (nameEl) nameEl.textContent = p.name;
  if (badgeEl) {
    badgeEl.textContent = p.role.toUpperCase();
    badgeEl.className = "badge role-" + p.role;
  }
  buildNav();
  showView(navItems[0]!.id);
}

/* ---- boot ---- */
initAuthForms();
initQuizModal();

onAuthStateChanged(auth, (user) => {
  void handleUser(user ? user.uid : null).catch((err) => {
    console.error(err);
    showToast("Startup error: " + (err as Error).message, "error");
  });
});

document.getElementById("logout-btn")?.addEventListener("click", () => {
  void signOut(auth);
});

window.addEventListener("unhandledrejection", (e) => {
  console.error(e.reason);
  showToast("Error: " + String((e as PromiseRejectionEvent).reason?.message ?? e.reason), "error");
});

if (!isConfigured) {
  document.body.insertAdjacentHTML("afterbegin",
    `<div class="config-banner">⚠️ SETUP: copy .env.example → .env, paste your Firebase keys (no quotes/spaces), then RESTART the dev server.</div>`);
}
