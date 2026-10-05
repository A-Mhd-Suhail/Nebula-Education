import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, isConfigured } from "../firebase";
import { $, authErrorMessage, showToast } from "../helpers";
import type { Role } from "../types";

/** Auto-generate an ID like STU-2025-K3F9 or TCH-2025-Q8X2 */
function makeId(prefix: string): string {
  const year = new Date().getFullYear();
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "X");
  return `${prefix}-${year}-${rand}`;
}

/** Show the real Firebase error code so nothing is hidden */
function errText(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "unknown";
  return authErrorMessage(err) + ` [${code}]`;
}

function previewId(): void {
  const input = $("#reg-student-id") as HTMLInputElement;
  input.value = makeId("STU");
  input.readOnly = true;
  input.title = "Auto-generated Student ID";
}

export function initAuthForms(): void {
  const switchTo = (which: "login" | "register"): void => {
    $("#tab-login").classList.toggle("active", which === "login");
    $("#tab-register").classList.toggle("active", which === "register");
    $("#login-form").classList.toggle("hidden", which !== "login");
    $("#register-form").classList.toggle("hidden", which !== "register");
    $("#auth-title").textContent = which === "login" ? "Welcome back" : "Create your account";
    if (which === "register") previewId();
  };

  $("#tab-login").addEventListener("click", () => switchTo("login"));
  $("#tab-register").addEventListener("click", () => switchTo("register"));

  $("#reg-role").addEventListener("change", () => {
    const role = ($("#reg-role") as HTMLSelectElement).value;
    $("#reg-student-fields").classList.toggle("hidden", role !== "student");
    $("#reg-teacher-fields").classList.toggle("hidden", role !== "teacher");
    previewId();
  });

  previewId();

  $("#login-form").addEventListener("submit", (e) => { e.preventDefault(); void doLogin(); });
  $("#register-form").addEventListener("submit", (e) => { e.preventDefault(); void doRegister(); });
}

function checkConfig(): boolean {
  if (isConfigured) return true;
  showToast("Firebase keys missing — check .env and RESTART the dev server.", "error");
  return false;
}

async function doLogin(): Promise<void> {
  if (!checkConfig()) return;
  const errEl = $("#login-error");
  const btn = $("#login-form button") as HTMLButtonElement;
  btn.disabled = true;
  try {
    await signInWithEmailAndPassword(
      auth,
      ($("#login-email") as HTMLInputElement).value.trim(),
      ($("#login-password") as HTMLInputElement).value);
    errEl.textContent = "";
  } catch (err) {
    errEl.textContent = errText(err);
  } finally {
    btn.disabled = false;
  }
}

async function doRegister(): Promise<void> {
  if (!checkConfig()) return;
  const errEl = $("#register-error");
  const btn = $("#register-form button") as HTMLButtonElement;
  const name = ($("#reg-name") as HTMLInputElement).value.trim();
  const email = ($("#reg-email") as HTMLInputElement).value.trim().toLowerCase();
  const password = ($("#reg-password") as HTMLInputElement).value;
  const role = ($("#reg-role") as HTMLSelectElement).value as Role;

  if (!name || !email || !password) {
    errEl.textContent = "Please fill name, email and password.";
    return;
  }

  btn.disabled = true;
  btn.textContent = "Creating account…";
  errEl.textContent = "";

  const data: Record<string, unknown> = { name, email, role, airScore: 0, createdAt: Date.now() };
  if (role === "student") {
    data.studentId = ($("#reg-student-id") as HTMLInputElement).value.trim() || makeId("STU");
    data.className = ($("#reg-class") as HTMLInputElement).value.trim() || "Class 10-A";
  }
  if (role === "teacher") {
    data.teacherId = makeId("TCH");
    data.subject = ($("#reg-subject") as HTMLInputElement).value.trim() || "General";
    data.className = ($("#reg-class-t") as HTMLInputElement).value.trim() || "Class 10-A";
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    try { await updateProfile(cred.user, { displayName: name }); } catch { /* ignore */ }
    await setDoc(doc(db, "users", cred.user.uid), { ...data, uid: cred.user.uid });
    const shownId = role === "student" ? String(data.studentId) : String(data.teacherId);
    showToast("Account created 🎉 Your ID: " + shownId);
  } catch (err) {
    errEl.textContent = errText(err);
  } finally {
    btn.disabled = false;
    btn.textContent = "Create account";
  }
}