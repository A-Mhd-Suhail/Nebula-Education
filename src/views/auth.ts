import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { auth, db, isConfigured } from "../firebase";
import { $, authErrorMessage, showToast } from "../helpers";
import type { Role } from "../types";

export function initAuthForms(): void {
  const switchTo = (which: "login" | "register"): void => {
    $("#tab-login").classList.toggle("active", which === "login");
    $("#tab-register").classList.toggle("active", which === "register");
    $("#login-form").classList.toggle("hidden", which !== "login");
    $("#register-form").classList.toggle("hidden", which !== "register");
    $("#auth-title").textContent = which === "login" ? "Welcome back" : "Create your account";
  };

  $("#tab-login").addEventListener("click", () => switchTo("login"));
  $("#tab-register").addEventListener("click", () => switchTo("register"));

  $("#reg-role").addEventListener("change", () => {
    const role = ($("#reg-role") as HTMLSelectElement).value;
    $("#reg-student-fields").classList.toggle("hidden", role !== "student");
    $("#reg-teacher-fields").classList.toggle("hidden", role !== "teacher");
  });

  $("#login-form").addEventListener("submit", (e) => { e.preventDefault(); void doLogin(); });
  $("#register-form").addEventListener("submit", (e) => { e.preventDefault(); void doRegister(); });
}

function checkConfig(): boolean {
  if (isConfigured) return true;
  showToast("Add your Firebase keys to the .env file first!", "error");
  return false;
}

async function doLogin(): Promise<void> {
  if (!checkConfig()) return;
  try {
    await signInWithEmailAndPassword(
      auth,
      ($("#login-email") as HTMLInputElement).value.trim(),
      ($("#login-password") as HTMLInputElement).value);
    $("#login-error").textContent = "";
  } catch (err) {
    $("#login-error").textContent = authErrorMessage(err);
  }
}

async function doRegister(): Promise<void> {
  if (!checkConfig()) return;
  const name = ($("#reg-name") as HTMLInputElement).value.trim();
  const email = ($("#reg-email") as HTMLInputElement).value.trim().toLowerCase();
  const password = ($("#reg-password") as HTMLInputElement).value;
  const role = ($("#reg-role") as HTMLSelectElement).value as Role;
  if (!name || !email || !password) return;

  const data: Record<string, unknown> = { name, email, role, airScore: 0, createdAt: Date.now() };
  if (role === "student") {
    data.studentId = ($("#reg-student-id") as HTMLInputElement).value.trim() || "STU-" + Date.now();
    data.className = ($("#reg-class") as HTMLInputElement).value.trim() || "Class 10-A";
  }
  if (role === "teacher") {
    data.subject = ($("#reg-subject") as HTMLInputElement).value.trim() || "General";
    data.className = ($("#reg-class-t") as HTMLInputElement).value.trim() || "Class 10-A";
  }

  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    try { await updateProfile(cred.user, { displayName: name }); } catch { /* ignore */ }
    await setDoc(doc(db, "users", cred.user.uid), { ...data, uid: cred.user.uid });
    $("#register-error").textContent = "";
    showToast("Account created 🎉");
  } catch (err) {
    $("#register-error").textContent = authErrorMessage(err);
  }
}