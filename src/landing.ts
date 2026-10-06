const byId = (id: string): HTMLElement | null => document.getElementById(id);

function openAuth(mode: "login" | "register"): void {
  byId("landing")?.classList.add("hidden");
  byId("auth-screen")?.classList.remove("hidden");
  byId(mode === "login" ? "tab-login" : "tab-register")?.click();
}

export function showLanding(): void { byId("auth-screen")?.classList.add("hidden"); byId("landing")?.classList.remove("hidden"); }
export function hideLanding(): void { byId("landing")?.classList.add("hidden"); byId("auth-screen")?.classList.add("hidden"); }

export function initLanding(): void {
  document.querySelectorAll<HTMLElement>("[data-auth]").forEach((button) => button.addEventListener("click", () => openAuth(button.dataset.auth === "register" ? "register" : "login")));
  byId("auth-back")?.addEventListener("click", showLanding);
  if ("IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => entries.forEach((entry) => { if (entry.isIntersecting) { entry.target.classList.add("in"); io.unobserve(entry.target); } }), { threshold: 0.15 });
    document.querySelectorAll(".rv").forEach((node) => io.observe(node));
  } else document.querySelectorAll(".rv").forEach((node) => node.classList.add("in"));
  document.addEventListener("pointermove", (event) => { const target = (event.target as HTMLElement).closest<HTMLElement>(".glass,.card,.auth-card"); if (!target) return; const rect = target.getBoundingClientRect(); target.style.setProperty("--mx", `${event.clientX - rect.left}px`); target.style.setProperty("--my", `${event.clientY - rect.top}px`); }, { passive: true });
}
