import { dbWatch } from "../store";
import { esc, timeAgo } from "../helpers";
import type { AuditEntry } from "../types";

export function render(root: HTMLElement): void {
  root.innerHTML = `<h3>🧾 Audit log (who did what)</h3><div id="au-list" class="stack"><p class="muted">Loading…</p></div>`;
  const el = root.querySelector("#au-list") as HTMLElement;
  dbWatch<AuditEntry>("auditLogs", { limit: 100 }, (rows) => {
    const arr = rows.sort((a, b) => b.createdAt - a.createdAt);
    el.innerHTML = arr.length
      ? `<div class="card"><table class="lb-table"><thead><tr><th>When</th><th>Who</th><th>Action</th><th>Detail</th></tr></thead><tbody>
        ${arr.map((a) => `<tr><td class="muted small">${timeAgo(a.createdAt)}</td><td>${esc(a.actorName)} <span class="muted small">(${esc(a.actorRole)})</span></td><td>${esc(a.action)}</td><td class="muted small">${esc(a.detail ?? "")}</td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">No audit entries yet.</p>`;
  });
}
