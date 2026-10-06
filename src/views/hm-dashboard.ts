import { dbList } from "../store";
import { esc, timeAgo, todayStr } from "../helpers";
import type { AlertEvent, Attendance, HardwareDevice, Incident, UserProfile } from "../types";

export function render(root: HTMLElement): void {
  root.innerHTML = `
    <h2>🏫 School overview</h2>
    <div class="grid4" id="hm-stats"></div>
    <div class="grid2">
      <div class="card"><h3>🚨 Latest alerts</h3><div id="hm-alerts"><p class="muted">Loading…</p></div></div>
      <div class="card"><h3>📋 Open incidents</h3><div id="hm-inc"><p class="muted">Loading…</p></div></div>
    </div>`;
  const stats = root.querySelector("#hm-stats") as HTMLElement;
  void (async () => {
    const today = todayStr();
    const [users, att, inc, alerts, hw] = await Promise.all([
      dbList<UserProfile>("users", { limit: 500 }),
      dbList<Attendance>("attendance", { where: [["date", "==", today]], limit: 500 }),
      dbList<Incident>("incidents", { limit: 100 }),
      dbList<AlertEvent>("alerts", { limit: 100 }),
      dbList<HardwareDevice>("hardware", { limit: 100 }),
    ]);
    const students = users.filter((u) => u.role === "student");
    const online = hw.filter((h) => h.status === "online").length;
    stats.innerHTML = `
      <div class="card stat"><h3>${students.length}</h3><p class="muted">Students</p></div>
      <div class="card stat"><h3>${users.filter((u) => u.role === "teacher").length}</h3><p class="muted">Teachers</p></div>
      <div class="card stat"><h3>${att.filter((a) => a.status === "present").length}</h3><p class="muted">Present today</p></div>
      <div class="card stat"><h3>${inc.filter((i) => i.status === "open").length}</h3><p class="muted">Open incidents</p></div>
      <div class="card stat"><h3>${alerts.filter((a) => a.status === "open").length}</h3><p class="muted">Open alerts</p></div>
      <div class="card stat"><h3>${online}/${hw.length}</h3><p class="muted">Devices online</p></div>`;
    (root.querySelector("#hm-alerts") as HTMLElement).innerHTML =
      alerts.sort((a, b) => b.createdAt - a.createdAt).slice(0, 6)
        .map((a) => `<div class="card small-card"><b>${esc(a.category)}</b> <span class="badge">${esc(a.priority)}</span><p class="small">${esc(a.message)}</p><p class="muted small">${timeAgo(a.createdAt)}</p></div>`).join("")
      || `<p class="muted">No alerts.</p>`;
    (root.querySelector("#hm-inc") as HTMLElement).innerHTML =
      inc.filter((i) => i.status === "open").sort((a, b) => b.createdAt - a.createdAt).slice(0, 6)
        .map((i) => `<div class="card small-card"><b>${esc(i.type)}</b> · ${esc(i.room || "—")} <span class="badge">${esc(i.priority)}</span><p class="small">${esc(i.description)}</p><p class="muted small">${timeAgo(i.createdAt)}</p></div>`).join("")
      || `<p class="muted">No open incidents 🎉</p>`;
  })().catch((e) => { stats.innerHTML = `<p class="muted">Failed: ${esc((e as Error).message)}</p>`; });
}
