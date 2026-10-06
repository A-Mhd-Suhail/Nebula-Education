import { dbList } from "../store";
import { esc, showToast, starsHtml } from "../helpers";
import { recomputeTeacherScore } from "../airscore";
import { classLabel } from "../catalog";
import type { ClassSession, Doubt, Rating, UserProfile } from "../types";

export function render(root: HTMLElement): void {
  root.innerHTML = `<h3>🧑‍🏫 Teachers</h3><div id="ht-list" class="stack"><p class="muted">Loading…</p></div>`;
  const listEl = root.querySelector("#ht-list") as HTMLElement;
  void (async () => {
    const [teachers, ratings, doubts, sessions] = await Promise.all([
      dbList<UserProfile>("users", { where: [["role", "==", "teacher"]], limit: 200 }),
      dbList<Rating>("ratings", { limit: 500 }),
      dbList<Doubt>("doubts", { where: [["status", "==", "solved"]], limit: 300 }),
      dbList<ClassSession>("sessions", { limit: 300 }),
    ]);
    listEl.innerHTML = teachers.length
      ? teachers.map((t) => {
          const rs = ratings.filter((r) => r.teacherUid === t.uid);
          const avg = rs.length ? rs.reduce((s, r) => s + (r.stars ?? 0), 0) / rs.length : 0;
          const solved = doubts.filter((d) => d.answeredByUid === t.uid || d.answeredBy === t.name).length;
          const classes = sessions.filter((s) => s.teacherUid === t.uid).length;
          return `<div class="card small-card"><div><b>${esc(t.name)}</b> · ${esc(t.subject ?? "—")} · ${classLabel(t.className)}</div>
            <p class="muted small">${starsHtml(avg)} ${avg.toFixed(1)} (${rs.length} ratings) · doubts solved ${solved} · classes ${classes} · AIR ${t.airScore ?? 0}</p>
            <button class="btn" data-rec="${t.uid}" type="button">↻ Recompute teacher score</button></div>`;
        }).join("")
      : `<p class="muted">No teachers registered.</p>`;
  })().catch((e) => { listEl.innerHTML = `<p class="muted">Failed: ${esc((e as Error).message)}</p>`; });
  listEl.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest("button[data-rec]") as HTMLElement | null;
    if (!b) return;
    showToast("Recomputing…");
    const s = await recomputeTeacherScore(b.dataset.rec!, "hm manual");
    showToast(s === null ? "Failed — are Cloud Functions deployed?" : `New score: ${s}`);
  };
}
