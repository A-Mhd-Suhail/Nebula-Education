import { audit } from "../auditlog";
import { addViewListener } from "../router";
import { state } from "../state";
import { dbGet, dbUpdate, dbWatch } from "../store";
import { $, esc, showToast, timeAgo } from "../helpers";
import type { Incident, NoiseEvent } from "../types";

let incidents: Incident[] = [];
let noise: NoiseEvent[] = [];
let tab = "fights";

export function renderIncidents(): void {
  const root = $("#incidents-root");
  root.innerHTML = `
    <div class="card">
      <h3>⚖️ Incident & Evidence Review</h3>
      <p class="hint">⚖️ Principle: <b>Detected → Alert → Human Review → Action.</b> AI detections are flags — never automatic punishment. Review, add notes, then decide.</p>
      <div class="subtabs">
        <button class="subtab active" data-t="fights" type="button">🥊 Physical incidents</button>
        <button class="subtab" data-t="noise" type="button">🔊 Noise violations</button>
        <button class="subtab" data-t="teachers" type="button">👩‍🏫 Teacher activity</button>
      </div>
    </div>
    <div id="inc-body"><div class="loading">Loading…</div></div>`;

  root.querySelectorAll(".subtab").forEach((b) =>
    b.addEventListener("click", () => {
      root.querySelectorAll(".subtab").forEach((x) => x.classList.remove("active"));
      b.classList.add("active");
      tab = (b as HTMLElement).dataset.t!;
      paint();
    }));

  addViewListener(dbWatch<Incident>("incidents", {}, (rows) => {
    incidents = rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    paint();
  }));
  addViewListener(dbWatch<NoiseEvent>("noiseEvents", {}, (rows) => {
    noise = rows.sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    paint();
  }));
}

function setStatus(id: string, status: Incident["status"]): void {
  void (async () => {
    await dbUpdate("incidents", id, { status, resolvedAt: Date.now(), reviewedBy: state.profile?.name });
    await audit("incident_" + status, id);
    showToast("Incident → " + status);
  })();
}

function paint(): void {
  const body = $("#inc-body");
  if (!body) return;

  if (tab === "fights") {
    const rows = incidents.filter((i) => i.type === "fight" || i.type === "misbehavior");
    body.innerHTML = rows.map((i) => `
      <div class="card incident ${i.status}">
        <div class="post-head">
          <span class="sev-badge ${i.priority}">${i.priority.toUpperCase()}</span>
          <span class="badge">${esc(i.type)}</span>
          <span class="badge ${i.status === "open" ? "orange" : i.status === "escalated" ? "green" : "muted"}">${esc(i.status)}</span>
          ${i.room ? `<span class="badge">${esc(i.room)}</span>` : ""}
          <span class="muted">${timeAgo(i.createdAt)}</span>
        </div>
        <p>${esc(i.description)}</p>
        ${i.involvedNames.length ? `<p class="muted">People (if confidently associated): ${i.involvedNames.map(esc).join(", ")}</p>` : `<p class="muted">People: not confidently identified</p>`}
        ${typeof i.confidence === "number" ? `<p class="muted">🤖 AI confidence: ${(i.confidence * 100).toFixed(0)}% · 📷 Camera: ${esc(i.cameraId ?? "—")} · evidence clip attached on gateway</p>` : ""}
        ${i.reviewerNote ? `<p class="answer"><b>📝 Review note (${esc(i.reviewedBy ?? "")}):</b> ${esc(i.reviewerNote)}</p>` : ""}
        <div class="add-topic">
          <input class="js-review-text" data-id="${i.id}" placeholder="Reviewer note (what did you find?)" style="flex:1">
          <button class="btn btn-primary js-review" data-id="${i.id}" type="button">✅ Mark reviewed</button>
          <button class="btn js-dismiss" data-id="${i.id}" type="button">🗑️ Dismiss</button>
          <button class="btn btn-danger js-escalate" data-id="${i.id}" type="button">⚠️ Escalate</button>
        </div>
      </div>`).join("") || `<p class="muted">No physical-incident flags. 🎉</p>`;
  } else if (tab === "noise") {
    body.innerHTML = noise.map((n) => `
      <div class="card">
        <div class="post-head"><span class="badge ${n.level >= n.threshold ? "orange" : "muted"}">${n.level}dB</span>
          <b>${esc(n.room)}</b><span class="muted">${timeAgo(n.createdAt)}</span></div>
        <p class="muted">Alarm threshold: ${n.threshold}dB ${n.level >= n.threshold ? "· ❌ exceeded — buzzer triggered" : ""}</p>
      </div>`).join("") || `<p class="muted">No noise events logged.</p>`;
  } else {
    const rows = incidents.filter((i) => i.type === "teacher_violation");
    body.innerHTML = rows.map((i) => `
      <div class="card incident ${i.status}">
        <div class="post-head">
          <span class="sev-badge ${i.priority}">${i.priority.toUpperCase()}</span>
          <b>${esc(i.involvedNames[0] ?? "Teacher")}</b>
          <span class="badge ${i.status === "open" ? "orange" : "green"}">${esc(i.status)}</span>
          <span class="muted">${timeAgo(i.createdAt)}</span>
        </div>
        <p>${esc(i.description)}</p>
        ${i.cameraId ? `<p class="muted">📷 Camera: ${esc(i.cameraId)}</p>` : ""}
        ${i.reviewerNote ? `<p class="answer"><b>📝 Review note:</b> ${esc(i.reviewerNote)}</p>` : ""}
        <div class="add-topic">
          <input class="js-review-text" data-id="${i.id}" placeholder="Reviewer note" style="flex:1">
          <button class="btn btn-primary js-review" data-id="${i.id}" type="button">✅ Mark reviewed</button>
          <button class="btn js-dismiss" data-id="${i.id}" type="button">🗑️ Dismiss</button>
        </div>
      </div>`).join("") || `<p class="muted">No teacher activity flags. 🎉</p>`;
  }

  body.querySelectorAll(".js-review").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const id = (b as HTMLElement).dataset.id!;
      const card = (b as HTMLElement).closest(".card")!;
      const input = card.querySelector(".js-review-text") as HTMLInputElement;
      await dbUpdate("incidents", id, {
        status: "reviewed", reviewerNote: input.value.trim(),
        reviewedBy: state.profile?.name ?? "", reviewedAt: Date.now(),
      });
      await audit("incident_reviewed", id);
      showToast("Marked reviewed ✅");
    })()));
  body.querySelectorAll(".js-dismiss").forEach((b) =>
    b.addEventListener("click", () => setStatus((b as HTMLElement).dataset.id!, "dismissed")));
  body.querySelectorAll(".js-escalate").forEach((b) =>
    b.addEventListener("click", () => setStatus((b as HTMLElement).dataset.id!, "escalated")));
}