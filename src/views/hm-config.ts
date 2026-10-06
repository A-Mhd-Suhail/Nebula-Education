--------------------------------------------------------------------------------
import { dbAdd, dbDelete, dbGet, dbSet, dbWatch } from "../store";
import { DEFAULT_SETTINGS, cmdPushThresholds, loadSettings } from "../hardware";
import { CLASS_LIST, classLabel, createSearchableSelect, getSelectValue } from "../catalog";
import { esc, showToast } from "../helpers";
import type { DeviceTag, SystemSettings, UserProfile } from "../types";

const NUMF: (keyof SystemSettings)[] = ["distanceThreshold", "entryGraceMin", "exitGraceMin", "noiseWarningDb", "noiseAlarmDb", "noiseDurationSec", "engagementMinutes", "quizQuestions", "coverageThreshold", "heartbeatTimeoutSec"];
const STRF: (keyof SystemSettings)[] = ["schoolStart", "schoolEnd", "mqttBroker", "mqttTopicIn", "mqttTopicOut", "mqttUser", "mqttPass"];

export function render(root: HTMLElement): void {
  root.innerHTML = `
    <div class="card"><h3>⚙️ System settings</h3><div class="grid3" id="cf-fields"></div>
      <div class="feed-actions" style="margin-top:10px">
        <button id="cf-save" class="btn btn-primary" type="button">💾 Save settings</button>
        <button id="cf-push" class="btn" type="button">📡 Push thresholds to hardware</button>
      </div></div>
    <div class="card"><h3>🔒 Class join PINs</h3>
      <p class="muted small">Students must enter this PIN at registration. Empty = open join.</p>
      <div id="cf-pins"></div>
      <button id="cf-savepins" class="btn btn-primary" style="margin-top:8px" type="button">💾 Save PINs</button></div>
    <div class="card"><h3>🏷 Hardware tags (BLE → person)</h3>
      <div class="tt-form">
        <div id="cf-user-slot"></div>
        <input id="cf-tagid" placeholder="TAG-ID e.g. A1B2C3" style="max-width:180px" />
        <button id="cf-addtag" class="btn btn-primary" type="button">Link tag</button></div>
      <div id="cf-tags" class="stack" style="margin-top:8px"><p class="muted">Loading…</p></div></div>`;

  const fields = root.querySelector("#cf-fields") as HTMLElement;
  const tagsEl = root.querySelector("#cf-tags") as HTMLElement;

  void (async () => {
    const s = { ...DEFAULT_SETTINGS, ...(await loadSettings()) };
    fields.innerHTML =
      NUMF.map((k) => `<label>${k} <input id="cf-${k}" type="number" step="any" value="${String(s[k])}" /></label>`).join("") +
      STRF.map((k) => `<label>${k} <input id="cf-${k}" type="text" value="${esc(String(s[k] ?? ""))}" /></label>`).join("") +
      (["attendance", "learning", "quiz", "assignments", "participation"] as const)
        .map((k) => `<label>weight.${k} <input id="cf-w-${k}" type="number" step="any" value="${s.airWeights[k]}" /></label>`).join("");

    function num(id: string, dflt: number): number {
      const v = Number((root.querySelector(`#cf-${id}`) as HTMLInputElement).value);
      return Number.isFinite(v) ? v : dflt;
    }
    (root.querySelector("#cf-save") as HTMLButtonElement).onclick = async () => {
      const patch: Record<string, unknown> = {};
      for (const k of NUMF) patch[k] = num(k as string, DEFAULT_SETTINGS[k] as number);
      for (const k of STRF) patch[k] = (root.querySelector(`#cf-${k}`) as HTMLInputElement).value.trim();
      patch.airWeights = {
        attendance: num("w-attendance", 25), learning: num("w-learning", 25), quiz: num("w-quiz", 20),
        assignments: num("w-assignments", 15), participation: num("w-participation", 15),
      };
      await dbSet("settings", "hardware", patch);
      await loadSettings();
      showToast("Settings saved ✅");
    };
    (root.querySelector("#cf-push") as HTMLButtonElement).onclick = () => { cmdPushThresholds(); showToast("Thresholds pushed 📡"); };

    // class PINs
    const pins = (await dbGet<{ pins?: Record<string, string> }>("settings", "classpins"))?.pins ?? {};
    (root.querySelector("#cf-pins") as HTMLElement).innerHTML =
      CLASS_LIST.map((c) => `<label style="display:inline-block;margin:4px">${c.label} <input id="pin-${c.id}" style="max-width:90px;display:inline-block;width:90px" placeholder="—" value="${esc(pins[c.id] ?? "")}" /></label>`).join("");
    (root.querySelector("#cf-savepins") as HTMLButtonElement).onclick = async () => {
      const out: Record<string, string> = {};
      for (const c of CLASS_LIST) {
        const v = (root.querySelector(`#pin-${c.id}`) as HTMLInputElement).value.trim();
        if (v) out[c.id] = v;
      }
      await dbSet("settings", "classpins", { pins: out });
      showToast("PINs saved ✅");
    };

    // tag registry
    const users = await dbList<UserProfile>("users", { limit: 500 });
    (root.querySelector("#cf-user-slot") as HTMLElement)
      .appendChild(createSearchableSelect("cf-user", users.map((u) => ({ id: u.uid, label: `${u.name} (${u.role})` })), "🔍 Choose person…"));
    (root.querySelector("#cf-addtag") as HTMLButtonElement).onclick = async () => {
      const uid = getSelectValue("cf-user");
      const tagId = (root.querySelector("#cf-tagid") as HTMLInputElement).value.trim().toUpperCase();
      const u = users.find((x) => x.uid === uid);
      if (!u || !tagId) { showToast("Pick person + tag id", "error"); return; }
      await dbAdd("devices", { tagId, uid: u.uid, name: u.name, role: u.role, room: u.className ?? "", createdAt: Date.now() });
      (root.querySelector("#cf-tagid") as HTMLInputElement).value = "";
      showToast("Tag linked 🏷");
    };
    dbWatch<DeviceTag>("devices", { limit: 200 }, (rows) => {
      tagsEl.innerHTML = rows.length
        ? rows.map((t) => `<div class="card small-card"><b>${esc(t.tagId)}</b> → ${esc(t.name)} (${esc(t.role)}) · ${classLabel(t.room)} <button class="btn btn-ghost" data-deltag="${t.id}" type="button">✖</button></div>`).join("")
        : `<p class="muted">No tags linked yet.</p>`;
    });
  })().catch((e) => showToast("Config load failed: " + (e as Error).message, "error"));

  tagsEl.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button[data-deltag]") as HTMLElement | null;
    if (b) void dbDelete("devices", b.dataset.deltag!);
  };
}

