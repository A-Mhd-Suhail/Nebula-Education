import { state } from "../state";
import { dbGet, dbList } from "../store";
import { esc, todayStr, timeAgo } from "../helpers";
import { classLabel } from "../catalog";
import { getAirHistory } from "../airscore";
import type { Attendance, UserProfile } from "../types";

export function render(root: HTMLElement): void {
  const me = state.profile!;
  root.innerHTML = `<div id="prof-body"><p class="muted">Loading profile…</p></div>`;
  const body = root.querySelector("#prof-body") as HTMLElement;

  async function paint(): Promise<void> {
    try {
      const [fresh, hist, att] = await Promise.all([
        dbGet<UserProfile>("users", me.uid),
        getAirHistory(me.uid),
        dbList<Attendance>("attendance", { where: [["uid", "==", me.uid]], limit: 400 }),
      ]);
      const u = fresh ?? me;
      const presentDays = new Set(att.filter((a) => a.status === "present").map((a) => a.date));
      const now = new Date();
      const y = now.getFullYear(), m = now.getMonth();
      const first = new Date(y, m, 1).getDay();
      const days = new Date(y, m + 1, 0).getDate();
      const today = todayStr();
      let cells = "";
      for (let i = 0; i < first; i++) cells += "<span></span>";
      for (let d = 1; d <= days; d++) {
        const ds = `${y}-${String(m + 1).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
        const cls = presentDays.has(ds) ? "cal-p" : (ds === today ? "cal-today" : "");
        cells += `<span class="${cls}" title="${ds}">${d}</span>`;
      }
      const maxDelta = Math.max(1, ...hist.map((h) => Math.abs(h.delta ?? 0)));
      body.innerHTML = `
        <div class="card prof-head">
          <div class="avatar">${esc((u.name || "?").slice(0, 1).toUpperCase())}</div>
          <div>
            <h2>${esc(u.name)}</h2>
            <p class="muted small">${esc(u.email)} · <span class="badge">${esc(u.role)}</span></p>
            <p class="muted small">${u.studentId ? "ID " + esc(u.studentId) + " · " : ""}${u.teacherId ? "ID " + esc(u.teacherId) + " · " : ""}${classLabel(u.className)}${u.subject ? " · " + esc(u.subject) : ""}</p>
          </div>
          <button id="prof-refresh" class="btn" type="button">↻ Refresh</button>
        </div>
        <div class="grid3">
          <div class="card stat"><h3>${u.airScore ?? 0}</h3><p class="muted">AIR Score</p></div>
          <div class="card stat"><h3>${u.behaviorScore ?? 100}</h3><p class="muted">Behavior Score</p></div>
          <div class="card stat"><h3>${att.length ? Math.round(presentDays.size / Math.max(1, new Set(att.map((a) => a.date)).size) * 100) : 0}%</h3><p class="muted">Attendance</p></div>
        </div>
        <div class="card"><h3>📅 Attendance — ${now.toLocaleString(undefined, { month: "long", year: "numeric" })}</h3>
          <div class="cal">${cells}</div>
          <p class="muted small">Green = present · outlined = today</p></div>
        <div class="card"><h3>📈 AIR history (last ${hist.length} changes)</h3>
          ${hist.length ? hist.map((h) => `<div class="bar-row"><span class="muted small" style="width:90px">${timeAgo(h.createdAt)}</span><div class="bar"><div class="bar-fill ${(h.delta ?? 0) >= 0 ? "up" : "down"}" style="width:${Math.min(100, Math.abs(h.delta ?? 0) / maxDelta * 100)}%"></div></div><b class="small">${(h.delta ?? 0) > 0 ? "+" : ""}${h.delta ?? 0} → ${h.total}</b></div>`).join("") : `<p class="muted">No score changes yet.</p>`}
        </div>`;
      (root.querySelector("#prof-refresh") as HTMLButtonElement).onclick = () => void paint();
    } catch (e) {
      body.innerHTML = `<div class="card"><h3>⚠️ Profile failed to load</h3><p class="muted">${esc((e as Error).message)}</p></div>`;
    }
  }
  void paint();
}
