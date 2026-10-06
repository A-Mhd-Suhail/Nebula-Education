import type { Role } from "./types";
import { state } from "./state";
import { $, $$, esc } from "./helpers";
import { renderProfile } from "./views/profile";
import { renderStudentDashboard } from "./views/student-dashboard";
import { renderInclass } from "./views/inclass";
import { renderOffclass } from "./views/offclass";
import { renderSocial } from "./views/social";
import { renderDoubts } from "./views/doubts";
import { renderProjects } from "./views/projects";
import { renderTeacherLive } from "./views/teacher-live";
import { renderBoard } from "./views/board";
import { renderQuizApprovals } from "./views/quiz-approvals";
import { renderAssignments } from "./views/assignments";
import { renderClassroom } from "./views/classroom";
import { renderTimetable } from "./views/timetable";
import { renderHmDashboard } from "./views/hm-dashboard";
import { renderHardware } from "./views/hm-hardware";
import { renderHmAlerts } from "./views/hm-alerts";
import { renderIncidents } from "./views/hm-incidents";
import { renderHmTeachers } from "./views/hm-teachers";
import { renderHmStudents } from "./views/hm-students";
import { renderReports } from "./views/hm-reports";
import { renderAudit } from "./views/hm-audit";
import { renderConfig } from "./views/hm-config";
import { renderAnalytics } from "./views/analytics";

export interface NavItem { id: string; label: string; icon: string }

const HM_NAV: NavItem[] = [
  { id: "hmdash", label: "Command Center", icon: "📊" },
  { id: "hardware", label: "Hardware Health", icon: "🔧" },
  { id: "alerts", label: "Alert Center", icon: "🚨" },
  { id: "incidents", label: "Incidents & Review", icon: "⚖️" },
  { id: "hmteachers", label: "Teacher Management", icon: "👨‍🏫" },
  { id: "hmstudents", label: "Student Management", icon: "👨‍🎓" },
  { id: "reports", label: "Reports & Export", icon: "📑" },
  { id: "audit", label: "Audit Log", icon: "📜" },
  { id: "config", label: "System Settings", icon: "⚙️" },
];
const MEO_NAV: NavItem[] = [
  { id: "analytics", label: "Analytics", icon: "📊" },
  { id: "alerts", label: "Alert Center", icon: "🚨" },
  { id: "reports", label: "Reports & Export", icon: "📑" },
];

export const NAV: Record<Role, NavItem[]> = {
  student: [
    { id: "studentdash", label: "My Class (Live)", icon: "🏠" },
    { id: "inclass", label: "In Class (3-Device)", icon: "📶" },
    { id: "offclass", label: "Off Class", icon: "📚" },
    { id: "social", label: "Student LinkedIn", icon: "💬" },
    { id: "doubts", label: "Post Doubts", icon: "❓" },
    { id: "projects", label: "Display Project", icon: "🛠️" },
    { id: "profile", label: "My Profile", icon: "👤" },
  ],
  teacher: [
    { id: "profile", label: "My Profile", icon: "👤" },
    { id: "teacherlive", label: "Live Class View", icon: "📋" },
    { id: "board", label: "Board Notes", icon: "📷" },
    { id: "approvals", label: "Quiz Approvals", icon: "🧪" },
    { id: "classroom", label: "Class Room (Hood)", icon: "🏫" },
    { id: "assignments", label: "Assignments", icon: "📘" },
    { id: "social", label: "Teacher LinkedIn", icon: "💬" },
    { id: "doubts", label: "Doubt Solve", icon: "❓" },
    { id: "timetable", label: "Time Table", icon: "🗓️" },
  ],
  hm: HM_NAV,
  admin: HM_NAV,
  meo: MEO_NAV,
  deo: MEO_NAV,
};

export let navItems: NavItem[] = [];

const listeners: Array<() => void> = [];
export function addViewListener(unsub: () => void): void { listeners.push(unsub); }
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
  $$("#nav .nav-btn").forEach((b) => b.addEventListener("click", () => showView((b as HTMLElement).dataset.view!)));
}

export function showView(id: string): void {
  clearViewListeners();
  $$(".view").forEach((v) => v.classList.remove("active"));
  const section = document.getElementById("view-" + id);
  if (section) section.classList.add("active");
  $$("#nav .nav-btn").forEach((b) => b.classList.toggle("active", (b as HTMLElement).dataset.view === id));
  const item = navItems.find((n) => n.id === id);
  $("#view-title").textContent = item ? item.label : "";

  const loaders: Record<string, () => void | Promise<void>> = {
    profile: () => renderProfile(),
    studentdash: () => renderStudentDashboard(),
    inclass: () => renderInclass(),
    offclass: () => renderOffclass(),
    social: () => renderSocial(),
    doubts: () => renderDoubts(),
    projects: () => renderProjects(),
    teacherlive: () => renderTeacherLive(),
    board: () => renderBoard(),
    approvals: () => renderQuizApprovals(),
    assignments: () => renderAssignments(),
    classroom: () => renderClassroom(),
    timetable: () => renderTimetable(),
    hmdash: () => renderHmDashboard(),
    hardware: () => renderHardware(),
    alerts: () => renderHmAlerts(),
    incidents: () => renderIncidents(),
    hmteachers: () => renderHmTeachers(),
    hmstudents: () => renderHmStudents(),
    reports: () => renderReports(),
    audit: () => renderAudit(),
    config: () => renderConfig(),
    analytics: () => renderAnalytics(),
  };
  const loader = loaders[id];
  if (loader) void loader();
}