export function $<T extends HTMLElement = HTMLElement>(sel: string, scope: ParentNode = document): T {
  const el = scope.querySelector(sel);
  if (!el) throw new Error("Missing element: " + sel);
  return el as T;
}

export function $$(sel: string, scope: ParentNode = document): HTMLElement[] {
  return Array.from(scope.querySelectorAll(sel)) as HTMLElement[];
}

export function esc(s: unknown): string {
  return String(s ?? "").replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] as string));
}

export function todayStr(): string {
  const d = new Date();
  return d.getFullYear() + "-" +
    String(d.getMonth() + 1).padStart(2, "0") + "-" +
    String(d.getDate()).padStart(2, "0");
}

export function timeAgo(ts: number): string {
  const m = Math.floor((Date.now() - Number(ts || 0)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return m + "m ago";
  if (m < 1440) return Math.floor(m / 60) + "h ago";
  return Math.floor(m / 1440) + "d ago";
}

export function starsHtml(n: number): string {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  return "★".repeat(v) + "☆".repeat(5 - v);
}

let toastTimer: ReturnType<typeof setTimeout> | undefined;
export function showToast(msg: string, type: "success" | "error" = "success"): void {
  const t = document.getElementById("toast");
  if (!t) return;
  t.textContent = msg;
  t.className = "toast " + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.className = "toast hidden"; }, 3400);
}

export function authErrorMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-email": "Invalid email address.",
    "auth/user-not-found": "No account found with this email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Invalid email or password.",
    "auth/email-already-in-use": "This email is already registered.",
    "auth/weak-password": "Password must be at least 6 characters.",
    "auth/too-many-requests": "Too many attempts. Try again later.",
    "auth/operation-not-allowed": "Enable Email/Password sign-in in Firebase Console.",
    "auth/invalid-api-key": "Check your Firebase API key in .env",
    "auth/network-request-failed": "Network error — check your internet connection.",
  };
  return map[code] ?? "Something went wrong. Please try again.";
}