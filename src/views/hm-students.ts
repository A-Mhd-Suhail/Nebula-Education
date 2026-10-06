--------------------------------------------------------------------------------
import { dbList } from "../store";
import { esc, showToast } from "../helpers";
import { recomputeAirScore } from "../airscore";
import { CLASS_LIST, classLabel } from "../catalog";
import type { UserProfile } from "../types";

export function render(root: HTMLElement): void {
  root.innerHTML = `
    <div class="card"><h3>🎓 Students</h3>
      <select id="hs-class" style="max-width:220px"><option value="">All classes</option>${CLASS_LIST.map((c) => `<option value="${c.id}">${c.label}</option>`).join("")}</select>
      <button id="hs-refresh" class="btn" type="button">↻ Refresh</button></div>
    <div id="hs-list" class="stack"><p class="muted">Loading…</p></div>`;
  const listEl = root.querySelector("#hs-list") as HTMLElement;

  async function load(): Promise<void> {
    const cls = (root.querySelector("#hs-class") as HTMLSelectElement).value;
    const students = await dbList<UserProfile>("users", { where: [["role", "==", "student"]], limit: 500 });
    const arr = students.filter((u) => !cls || u.className === cls).sort((a, b) => (b.airScore ?? 0) - (a.airScore ?? 0));
    listEl.innerHTML = arr.length
      ? `<div class="card"><table class="lb-table"><thead><tr><th>Name</th><th>Class</th><th>AIR</th><th>Behavior</th><th></th></tr></thead><tbody>
        ${arr.map((u) => `<tr><td>${esc(u.name)}</td><td>${classLabel(u.className)}</td><td>${u.airScore ?? 0}</td><td>${u.behaviorScore ?? 100}</td>
        <td><button class="btn" data-rec="${u.uid}" type="button">↻</button></td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">No students found.</p>`;
  }
  (root.querySelector("#hs-class") as HTMLSelectElement).onchange = () => void load();
  (root.querySelector("#hs-refresh") as HTMLButtonElement).onclick = () => void load();
  listEl.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest("button[data-rec]") as HTMLElement | null;
    if (!b) return;
    showToast("Recomputing…");
    const s = await recomputeAirScore(b.dataset.rec!, "hm manual");
    showToast(s === null ? "Failed" : `New AIR: ${s}`);
    void load();
  };
  void load();
}

