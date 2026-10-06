import { state } from "../state";
import { dbGet, dbSet, dbUpdate, dbWatch } from "../store";
import { esc, showToast, timeAgo } from "../helpers";
import { recomputeAirScore } from "../airscore";
import { audit } from "../auditlog";
import type { Incident, UserProfile } from "../types";

export function render(root: HTMLElement): void {
  root.innerHTML = `<div class="tabs">
    <button class="btn active" data-f="open" type="button">Open</button>
    <button class="btn" data-f="reviewed" type="button">Reviewed</button>
    <button class="btn" data-f="all" type="button">All</button></div>
    <div id="in-list" class="stack"><p class="muted">Loading…</p></div>`;
  const listEl = root.querySelector("#in-list") as HTMLElement;
  let filter = "open";
  let rows: Incident[] = [];
  root.querySelectorAll<HTMLButtonElement>(".tabs .btn").forEach((b) => b.onclick = () => {
    filter = b.dataset.f!;
    root.querySelectorAll(".tabs .btn").forEach((x) => x.classList.toggle("active", x === b));
    paint();
  });
  dbWatch<Incident>("incidents", { limit: 120 }, (r) => { rows = r.sort((a, b) => b.createdAt - a.createdAt); paint(); });
  function paint(): void {
    const arr = rows.filter((i) => (filter === "all" ? true : i.status === filter));
    listEl.innerHTML = arr.length
      ? arr.map((i) => `<div class="card">
          <div><b>${esc(i.type)}</b> · ${esc(i.room || "—")} <span class="badge">${esc(i.priority)}</span> <span class="badge">${esc(i.status)}</span> <span class="muted small">${timeAgo(i.createdAt)}</span></div>
          <p>${esc(i.description)}</p>
          ${i.involvedNames?.length ? `<p class="muted small">Involved: ${esc(i.involvedNames.join(", "))}</p>` : ""}
          ${i.reviewedBy ? `<p class="muted small">Reviewed by ${esc(i.reviewedBy)}: ${esc(i.reviewerNote ?? "")}</p>` : ""}
          <div class="feed-actions">
            ${i.status === "open" ? `
              <input data-note="${i.id}" placeholder="Reviewer note (optional)" style="max-width:260px" />
              <button class="btn btn-primary" data-rev="${i.id}" type="button">✅ Mark reviewed (−15 behavior)</button>
              <button class="btn" data-dism="${i.id}" type="button">Dismiss (no penalty)</button>
              <button class="btn" data-esc="${i.id}" type="button">⬆ Escalate</button>` : ""}
          </div></div>`).join("")
      : `<p class="muted">Nothing here 🎉</p>`;
  }
  listEl.onclick = async (e) => {
    const t = e.target as HTMLElement;
    const rev = t.closest("button[data-rev]") as HTMLElement | null;
    const dis = t.closest("button[data-dism]") as HTMLElement | null;
    const escB = t.closest("button[data-esc]") as HTMLElement | null;
    const me = state.profile!;
    if (rev) {
      const id = rev.dataset.rev!;
      const note = (listEl.querySelector(`input[data-note="${id}"]`) as HTMLInputElement).value.trim();
      await dbUpdate("incidents", id, { status: "reviewed", reviewedBy: me.name, reviewedAt: Date.now(), reviewerNote: note });
      // BUG #9: fetch the incident (in scope now) — penalty applied ONLY after human review
      const inc = await dbGet<Incident>("incidents", id).catch(() => null);
      if (inc) {
        for (const uid of (inc.involvedIds ?? []) as string[]) {
          try {
            const u = await dbGet<UserProfile>("users", uid);
            if (u) {
              await dbSet("users", uid, { behaviorScore: Math.max(0, (u.behaviorScore ?? 100) - 15) });
              void recomputeAirScore(uid, "incident reviewed by HM");
            }
          } catch { /* skip */ }
        }
      }
      void audit("incident_reviewed", id);
      showToast("Reviewed — behavior updated");
    } else if (dis) {
      await dbUpdate("incidents", dis.dataset.dism!, { status: "dismissed", reviewedBy: me.name, reviewedAt: Date.now() });
      showToast("Dismissed — no penalty");
    } else if (escB) {
      await dbUpdate("incidents", escB.dataset.esc!, { status: "escalated" });
      showToast("Escalated ⬆");
    }
  };
}
