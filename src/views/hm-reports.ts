import { dbList } from "../store";
import { esc, todayStr } from "../helpers";
import { downloadCSV } from "../utils";
import { classLabel } from "../catalog";
import type { Attendance, UserProfile } from "../types";

export function render(root: HTMLElement): void {
  root.innerHTML = `
    <div class="card"><h3>📊 Attendance report</h3>
      <label>Date <input id="rp-date" type="date" value="${todayStr()}" style="max-width:200px" /></label>
      <div class="feed-actions">
        <button id="rp-load" class="btn btn-primary" type="button">Load</button>
        <button id="rp-csv" class="btn" type="button">⬇ Download CSV</button>
      </div></div>
    <div id="rp-body" class="stack"><p class="muted">Pick a date and load.</p></div>`;
  const body = root.querySelector("#rp-body") as HTMLElement;
  let rows: (string | number)[][] = [];

  async function load(): Promise<void> {
    const date = (root.querySelector("#rp-date") as HTMLInputElement).value || todayStr();
    body.innerHTML = `<p class="muted">Loading…</p>`;
    const [att, users] = await Promise.all([
      dbList<Attendance>("attendance", { where: [["date", "==", date]], limit: 500 }),
      dbList<UserProfile>("users", { limit: 500 }),
    ]);
    const students = users.filter((u) => u.role === "student");
    const byUid = new Map(att.filter((a) => a.role === "student").map((a) => [a.uid, a]));
    rows = [["Name", "Class", "Status", "Method"],
      ...students.map((s) => [s.name, classLabel(s.className), byUid.get(s.uid)?.status ?? "absent", byUid.get(s.uid)?.method ?? "—"])];
    const present = rows.slice(1).filter((r) => r[2] === "present").length;
    body.innerHTML = `<div class="card"><p><b>${present}/${students.length}</b> present on ${esc(date)} (${students.length ? Math.round(present / students.length * 100) : 0}%)</p>
      <table class="lb-table"><thead><tr><th>Name</th><th>Class</th><th>Status</th></tr></thead><tbody>
      ${rows.slice(1).map((r) => `<tr><td>${esc(r[0])}</td><td>${esc(r[1])}</td><td>${r[2] === "present" ? "✅" : "❌"}</td></tr>`).join("")}</tbody></table></div>`;
  }
  (root.querySelector("#rp-load") as HTMLButtonElement).onclick = () => void load();
  (root.querySelector("#rp-csv") as HTMLButtonElement).onclick = () => {
    if (rows.length > 1) downloadCSV(`attendance-${(root.querySelector("#rp-date") as HTMLInputElement).value}.csv`, rows);
  };
}
