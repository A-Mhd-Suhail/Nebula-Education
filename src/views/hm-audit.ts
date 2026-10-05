import { addViewListener } from "../router";
import { dbWatch } from "../store";
import { $, esc } from "../helpers";
import type { AuditEntry } from "../types";

export function renderAudit(): void {
  const root = $("#audit-root");
  root.innerHTML = `
    <div class="card"><h3>📜 Audit Log — who did what, when</h3>
      <p class="muted">Every sensitive action (settings changes, incident reviews, overrides, hardware ops) is recorded here.</p></div>
    <div class="card"><div id="audit-table"><div class="loading">Loading…</div></div></div>`;

  const unsub = dbWatch<AuditEntry>("auditLogs", { limit: 150 }, (rows) => {
    rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const box = $("#audit-table");
    if (!box) return;
    box.innerHTML = `<table class="table">
      <thead><tr><th>Who</th><th>Role</th><th>Action</th><th>Detail</th><th>When</th></tr></thead>
      <tbody>${rows.map((a) => `<tr>
        <td><b>${esc(a.actorName)}</b></td><td>${esc(a.actorRole)}</td>
        <td>${esc(a.action)}</td><td class="muted">${esc(a.detail ?? "")}</td>
        <td>${new Date(a.createdAt).toLocaleString()}</td></tr>`).join("")
        || `<tr><td colspan="5" class="muted">No audit entries yet.</td></tr>`}</tbody></table>`;
  });
  addViewListener(unsub);
}