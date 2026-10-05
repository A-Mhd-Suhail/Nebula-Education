import { audit } from "../auditlog";
import { addViewListener } from "../router";
import { state } from "../state";
import { dbGet, dbUpdate, dbWatch } from "../store";
import { $, esc, showToast, timeAgo } from "../helpers";
import type { AlertEvent } from "../types";

const CATEGORIES = ["all", "attendance", "fight", "noise", "teacher_activity", "engagement", "syllabus", "board", "hardware", "punctuality"];
let all: AlertEvent[] = [];
let fSev = "all", fCat = "all", fStatus = "all";

export function renderHmAlerts(): void {
  const root = $("#alerts-root");
  root.innerHTML = `
    <div class="card">
      <h3>🚨 Alert Center — every alert in one place</h3>
      <div class="filter-row">
        <label>Severity <select id="f-sev"><option value="all">All</option><option>critical</option><option>high</option><option>medium</option><option>low</option></select></label>
        <label>Category <select id="f-cat">${CATEGORIES.map((c) => `<option value="${c}">${c === "all" ? "All" : c}</option>`).join("")}</select></label>
        <label>Status <select id="f-status"><option value="all">All</option><option>open</option><option>ack</option><option>reviewed</option><option>dismissed</option><option>escalated</option></select></label>
      </div>
    </div>
    <div id="alert-list"><div class="loading">Loading…</div></div>`;

  $("#f-sev").addEventListener("change", () => { fSev = ($("#f-sev") as HTMLSelectElement).value; paint(); });
  $("#f-cat").addEventListener("change", () => { fCat = ($("#f-cat") as HTMLSelectElement).value; paint(); });
  $("#f-status").addEventListener("change", () => { fStatus = ($("#f-status") as HTMLSelectElement).value; paint(); });

  const unsub = dbWatch<AlertEvent>("alerts", { limit: 200 }, (rows) => {
    all = rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    paint();
  });
  addViewListener(unsub);
}

function paint(): void {
  const box = $("#alert-list");
  if (!box) return;
  const rows = all.filter((a) =>
    (fSev === "all" || a.priority === fSev) &&
    (fCat === "all" || a.category === fCat) &&
    (fStatus === "all" || a.status === fStatus));
  box.innerHTML = rows.slice(0, 60).map((a) => `
    <div class="card alert-card ${a.status}">
      <div class="post-head">
        <span class="sev-badge ${a.priority}">${a.priority.toUpperCase()}</span>
        <span class="badge">${esc(a.category)}</span>
        <span class="badge ${a.status === "open" ? "orange" : a.status === "escalated" ? "green" : "muted"}">${esc(a.status)}</span>
        ${a.room ? `<span class="badge">${esc(a.room)}</span>` : ""}
        <span class="muted">${timeAgo(a.createdAt)}</span>
      </div>
      <p>${esc(a.message)}</p>
      ${(a.notes ?? []).map((n) => `<p class="answer"><b>📝 ${esc(n.by)}:</b> ${esc(n.text)}</p>`).join("")}
      <div class="quick-row">
        ${a.status === "open" ? `<button class="btn js-act" data-id="${a.id}" data-s="ack" type="button">👋 Acknowledge</button>` : ""}
        <button class="btn js-act" data-id="${a.id}" data-s="reviewed" type="button">✅ Mark reviewed</button>
        <button class="btn js-act" data-id="${a.id}" data-s="dismissed" type="button">🗑️ Dismiss</button>
        <button class="btn btn-danger js-act" data-id="${a.id}" data-s="escalated" type="button">⚠️ Escalate</button>
      </div>
      <div class="add-topic">
        <input class="js-note-text" placeholder="Add a note…" style="flex:1">
        <button class="btn js-note" data-id="${a.id}" type="button">📝 Add note</button>
      </div>
    </div>`).join("") || `<p class="muted">No alerts match the filters.</p>`;

  box.querySelectorAll(".js-act").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const el = b as HTMLElement;
      await dbUpdate("alerts", el.dataset.id!, { status: el.dataset.s });
      await audit("alert_" + el.dataset.s, el.dataset.id!);
      showToast("Alert → " + el.dataset.s);
    })()));
  box.querySelectorAll(".js-note").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const el = b as HTMLElement;
      const card = el.closest(".alert-card")!;
      const input = card.querySelector(".js-note-text") as HTMLInputElement;
      const text = input.value.trim();
      if (!text) { showToast("Write a note first", "error"); return; }
      const cur = await dbGet<AlertEvent>("alerts", el.dataset.id!);
      const notes = [...(cur?.notes ?? []), { by: state.profile?.name ?? "?", text, at: Date.now() }];
      await dbUpdate("alerts", el.dataset.id!, { notes });
      input.value = "";
      showToast("Note added 📝");
    })()));
}