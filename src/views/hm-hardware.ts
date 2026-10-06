import { audit } from "../auditlog";
import { cmdCaptureBoard, cmdRestartCamera, cmdTestBuzzer } from "../hardware";
import { addViewListener } from "../router";
import { dbAdd, dbSet, dbWatch } from "../store";
import { $, esc, showToast, timeAgo } from "../helpers";
import type { HardwareDevice } from "../types";

const ICON: Record<string, string> = { pi: "🥧", esp32: "📡", camera: "📷", mic: "🎙️", buzzer: "🔊" };

let devices: HardwareDevice[] = [];

export function renderHardware(): void {
  const root = $("#hardware-root");
  root.innerHTML = `
    <div class="card">
      <h3>🔧 Register Hardware Device</h3>
      <div class="role-fields">
        <label>Device ID <input id="hw-id" placeholder="PI-ROOM204 / ESP-001 / BOARD-CAM-03"></label>
        <label>Type
          <select id="hw-type">
            <option value="pi">Raspberry Pi (gateway)</option>
            <option value="esp32">ESP32 (BLE)</option>
            <option value="camera">Camera</option>
            <option value="mic">Microphone</option>
            <option value="buzzer">Buzzer</option>
          </select></label>
        <label>Room <input id="hw-room" placeholder="Class 10-A"></label>
      </div>
      <br>
      <button class="btn btn-primary" id="hw-add" type="button">➕ Register Device</button>
      <span class="muted" style="margin-left:10px">Devices come ONLINE automatically when the Pi sends HEARTBEAT events. Offline alerts fire after the configured timeout.</span>
    </div>
    <div id="hw-list" class="grid-3"><div class="loading">Loading…</div></div>`;

  $("#hw-add").addEventListener("click", () => void (async () => {
    const deviceId = ($("#hw-id") as HTMLInputElement).value.trim().toUpperCase();
    const type = ($("#hw-type") as HTMLSelectElement).value as HardwareDevice["type"];
    const room = ($("#hw-room") as HTMLInputElement).value.trim();
    if (!deviceId) { showToast("Device ID required", "error"); return; }
    if (devices.some((d) => d.deviceId === deviceId)) { showToast("Device ID already registered", "error"); return; }
    await dbAdd("hardware", { deviceId, type, room, status: "connecting", lastSeen: Date.now() });
    await audit("hardware_register", deviceId + " → " + room);
    ($("#hw-id") as HTMLInputElement).value = "";
    showToast("Device registered ✅");
  })());

  const unsub = dbWatch<HardwareDevice>("hardware", {}, (rows) => {
    devices = rows.sort((a, b) => (a.room ?? "").localeCompare(b.room ?? ""));
    paint();
  });
  addViewListener(unsub);
}

function paint(): void {
  const list = $("#hw-list");
  if (!list) return;
  list.innerHTML = devices.map((d) => `
    <div class="card hw-card ${d.status}">
      <h3>${ICON[d.type] ?? "🔌"} ${esc(d.deviceId)}</h3>
      <div class="profile-row"><span>Type</span><b>${esc(d.type.toUpperCase())}</b></div>
      <div class="profile-row"><span>Room</span><b>${esc(d.room || "—")}</b></div>
      <div class="profile-row"><span>Status</span><b><span class="status-dot ${d.status === "online" ? "on" : "off"}"></span>${esc(d.status)}</b></div>
      <div class="profile-row"><span>Last seen</span><b>${d.lastSeen ? timeAgo(d.lastSeen) : "never"}</b></div>
      ${d.cpuTemp ? `<div class="profile-row"><span>CPU</span><b>${d.cpuTemp}°C · ${d.cpuUsage ?? 0}% · RAM ${d.ram ?? 0}%</b></div>` : ""}
      ${d.fw ? `<div class="profile-row"><span>Firmware</span><b>${esc(d.fw)}</b></div>` : ""}
      ${d.network ? `<div class="profile-row"><span>Network</span><b>${esc(d.network)}</b></div>` : ""}
      <div class="quick-row">
        ${d.type === "pi" || d.type === "buzzer" ? `<button class="btn js-buzz" data-id="${d.id}" data-room="${esc(d.room)}" type="button">🧪 Test buzzer</button>` : ""}
        ${d.type === "camera" || d.type === "pi" ? `<button class="btn js-restart" data-id="${d.id}" data-dev="${esc(d.deviceId)}" data-room="${esc(d.room)}" type="button">🔄 Restart</button>` : ""}
        ${d.type === "camera" ? `<button class="btn js-capture" data-room="${esc(d.room)}" type="button">📷 Capture board</button>` : ""}
        <button class="btn js-maint" data-id="${d.id}" data-status="${d.status === "maintenance" ? "online" : "maintenance"}" type="button">🛠️</button>
      </div>
    </div>`).join("") || `<p class="muted">No hardware registered yet.</p>`;

  list.querySelectorAll(".js-buzz").forEach((b) =>
    b.addEventListener("click", () => { cmdTestBuzzer((b as HTMLElement).dataset.room!); showToast("📣 TEST_BUZZER command sent"); }));
  list.querySelectorAll(".js-restart").forEach((b) =>
    b.addEventListener("click", () => { cmdRestartCamera((b as HTMLElement).dataset.room!, (b as HTMLElement).dataset.dev!); showToast("🔄 RESTART_CAMERA command sent"); }));
  list.querySelectorAll(".js-capture").forEach((b) =>
    b.addEventListener("click", () => { cmdCaptureBoard((b as HTMLElement).dataset.room!); showToast("📷 CAPTURE_BOARD command sent"); }));
  list.querySelectorAll(".js-maint").forEach((b) =>
    b.addEventListener("click", () => void (async () => {
      const el = b as HTMLElement;
      await dbSet("hardware", el.dataset.id!, { status: el.dataset.status });
      await audit("hardware_status", el.dataset.id + " → " + el.dataset.status);
      showToast("Status updated");
    })()));
}