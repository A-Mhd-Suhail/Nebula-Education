import type { Role } from "./types";
import { state } from "./state";
import { $, $$, esc } from "./helpers";
import { renderProfile } from "./views/profile";
import { renderInclass } from "./views/inclass";
import { renderOffclass } from "./views/offclass";
import { renderSocial } from "./views/social";
import { renderDoubts } from "./views/doubts";
import { renderProjects } from "./views/projects";
import { renderClassroom } from "./views/classroom";
import { renderTimetable } from "./views/timetable";
import { renderAdmin } from "./views/admin";

export interface NavItem { id: string; label: string; icon: string }

export const NAV: Record<Role, NavItem[]> = {
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

export let navItems: NavItem[] = [];

const listeners: Array<() => void> = [];
export function addViewListener(unsub: () => void): void {
  listeners.push(unsub);
}
export function clearViewListeners(): void {
  listeners.forEach((u) => { try { u(); } catch { /* noop */ } });
  listeners.length = 0;
}

export function buildNav(): void {
  if (!state.profile) return;
  navItems = NAV[state.profile.role] ?? NAV.student;
  const nav = $("#nav");
  nav.innerHTML = navItems
    .map((n) => `<button class="nav-btn" data-view="${n.id}" type="button"><span>${n.icon}</span>${esc(n.label)}</button>`)
    .join("");
  $$("#nav .nav-btn").forEach((b) =>
    b.addEventListener("click", () => showView((b as HTMLElement).dataset.view!)));
}

export function showView(id: string): void {
  clearViewListeners();
  $$(".view").forEach((v) => v.classList.remove("active"));
  const section = document.getElementById("view-" + id);
  if (section) section.classList.add("active");
  $$("#nav .nav-btn").forEach((b) =>
    b.classList.toggle("active", (b as HTMLElement).dataset.view === id));
  const item = navItems.find((n) => n.id === id);
  $("#view-title").textContent = item ? item.label : "";

  const loaders: Record<string, () => void | Promise<void>> = {
    profile: () => renderProfile(),
    inclass: () => renderInclass(),
    offclass: () => renderOffclass(),
    social: () => renderSocial(),
    doubts: () => renderDoubts(),
    projects: () => renderProjects(),
    classroom: () => renderClassroom(),
    timetable: () => renderTimetable(),
    admin: () => renderAdmin(),
  };
  const loader = loaders[id];
  if (loader) void loader();
}