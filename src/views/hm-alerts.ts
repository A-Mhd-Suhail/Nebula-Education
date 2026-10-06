import { dbUpdate, dbWatch } from "../store";
import { esc, showToast, timeAgo } from "../helpers";
import { audit } from "../auditlog";
import type { AlertEvent } from "../types";

export function render(root: HTMLElement): void {
  root.innerHTML = `<div class="tabs">
      <button class="btn active" data-f="open" type="button">Open</button>
      <button class="btn" data-f="ack" type="button">Acknowledged</button>
      <button class="btn" data-f="all" type="button">All</button></div>
    <div id="al-list" class="stack"><p class="muted">Loading…</p></div>`;
  const listEl = root.querySelector("#al-list") as HTMLElement;
  let filter = "open";
  let rows: AlertEvent[] = [];
  root.querySelectorAll<HTMLButtonElement>(".tabs .btn").forEach((b) => b.onclick = () => {
    filter = b.dataset.f!;
    root.querySelectorAll(".tabs .btn").forEach((x) => x.classList.toggle("active", x === b));
    paint();
  });
  dbWatch<AlertEvent>("alerts", { limit: 120 }, (r) => { rows = r.sort((a, b) => b.createdAt - a.createdAt); paint(); });
  function paint(): void {
    const arr = rows.filter((a) => (filter === "all" ? true : a.status === filter));
    listEl.innerHTML = arr.length
      ? arr.map((a) => `<div class="card small-card">
          <div><b>${esc(a.category)}</b> <span class="badge">${esc(a.priority)}</span> <span class="muted small">${esc(a.room || "")} · ${timeAgo(a.createdAt)}</span></div>
          <p>${esc(a.message)}</p>
          ${(a.notes ?? []).length ? `<p class="muted small">${(a.notes ?? []).map((n) => `${esc(n.by)}: ${esc(n.text)}`).join(" · ")}</p>` : ""}
          <div class="feed-actions">
            ${a.status === "open" ? `<button class="btn" data-ack="${a.id}" type="button">👁 Acknowledge</button>` : ""}
            ${a.status !== "dismissed" ? `<button class="btn btn-ghost" data-dis="${a.id}" type="button">Dismiss</button>` : `<span class="muted small">dismissed</span>`}
          </div></div>`).join("")
      : `<p class="muted">Nothing here 🎉</p>`;
  }
  listEl.onclick = async (e) => {
    const t = e.target as HTMLElement;
    const ack = t.closest("button[data-ack]") as HTMLElement | null;
    const dis = t.closest("button[data-dis]") as HTMLElement | null;
    if (ack) { await dbUpdate("alerts", ack.dataset.ack!, { status: "ack" }); showToast("Acknowledged"); }
    if (dis) { await dbUpdate("alerts", dis.dataset.dis!, { status: "dismissed" }); void audit("alert_dismissed", dis.dataset.dis!); }
  };
}
