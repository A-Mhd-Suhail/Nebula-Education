const el = (id: string): HTMLElement | null => document.getElementById(id);

function openAuth(mode: "login" | "register"): void {
  el("landing")?.classList.add("hidden");
  el("auth-screen")?.classList.remove("hidden");
  el(mode === "login" ? "tab-login" : "tab-register")?.click();
  window.scrollTo(0, 0);
}

export function showLanding(): void {
  el("auth-screen")?.classList.add("hidden");
  el("landing")?.classList.remove("hidden");
}

export function hideLanding(): void {
  el("landing")?.classList.add("hidden");
  el("auth-screen")?.classList.add("hidden");
}

export function initLanding(): void {
  document.querySelectorAll<HTMLElement>("[data-auth]").forEach((button) => {
    button.addEventListener("click", () => openAuth(button.dataset.auth === "register" ? "register" : "login"));
  });
  el("auth-back")?.addEventListener("click", showLanding);

  if ("IntersectionObserver" in window) {
    const observer = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) { entry.target.classList.add("in"); observer.unobserve(entry.target); }
      });
    }, { threshold: 0.15 });
    document.querySelectorAll(".rv").forEach((node) => observer.observe(node));
  } else document.querySelectorAll(".rv").forEach((node) => node.classList.add("in"));

  document.addEventListener("pointermove", (event) => {
    const target = (event.target as HTMLElement).closest<HTMLElement>(".glass,.card,.auth-card");
    if (!target) return;
    const rect = target.getBoundingClientRect();
    target.style.setProperty("--mx", `${event.clientX - rect.left}px`);
    target.style.setProperty("--my", `${event.clientY - rect.top}px`);
  }, { passive: true });
}
