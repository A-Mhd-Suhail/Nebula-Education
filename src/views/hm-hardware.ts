import { dbWatch } from "../store";
import { esc, timeAgo } from "../helpers";
import { cmdCaptureBoard, cmdPushThresholds, cmdRestartCamera, cmdTestBuzzer, connectHardware, disconnectHardware, onHardwareStatus } from "../hardware";
import type { HardwareDevice } from "../types";

export function render(root: HTMLElement): void {
  root.innerHTML = `
    <div class="card"><h3>🔌 MQTT bridge</h3>
      <p id="hw-status" class="muted small">Connecting…</p>
      <button id="hw-conn" class="btn btn-primary" type="button">Connect</button>
      <button id="hw-disc" class="btn" type="button">Disconnect</button>
      <button id="hw-thr" class="btn" type="button">📡 Push thresholds to devices</button></div>
    <h3>🖥 Devices (live heartbeats)</h3><div id="hw-list" class="stack"><p class="muted">No devices yet — start the Pi publisher.</p></div>`;
  const statusEl = root.querySelector("#hw-status") as HTMLElement;
  onHardwareStatus((s) => {
    statusEl.innerHTML = s.connected
      ? `✅ Connected to <b>${esc(s.broker)}</b> · topic <code>${esc(s.topicIn)}</code>`
      : `❌ Not connected ${s.error ? "— " + esc(s.error) : ""}`;
  });
  void connectHardware();
  (root.querySelector("#hw-conn") as HTMLButtonElement).onclick = () => void connectHardware();
  (root.querySelector("#hw-disc") as HTMLButtonElement).onclick = () => disconnectHardware();
  (root.querySelector("#hw-thr") as HTMLButtonElement).onclick = () => { cmdPushThresholds(); };

  const list = root.querySelector("#hw-list") as HTMLElement;
  dbWatch<HardwareDevice>("hardware", { limit: 60 }, (rows) => {
    const arr = rows.sort((a, b) => (b.lastSeen ?? 0) - (a.lastSeen ?? 0));
    list.innerHTML = arr.length
      ? arr.map((d) => `<div class="card small-card">
          <div><b>${esc(d.deviceId)}</b> <span class="badge ${d.status === "online" ? "" : "warn"}">${esc(d.status)}</span> · ${esc(d.type)} · ${esc(d.room)}</div>
          <p class="muted small">last seen ${d.lastSeen ? timeAgo(d.lastSeen) : "never"}${d.fw ? " · fw " + esc(d.fw) : ""}${d.cpuTemp ? ` · ${d.cpuTemp}°C` : ""}${d.ram ? ` · RAM ${d.ram}%` : ""}</p>
          <div class="feed-actions">
            <button class="btn" data-buzz="${esc(d.room)}" type="button">🔔 Test buzzer</button>
            <button class="btn" data-cap="${esc(d.room)}" type="button">📸 Capture board</button>
            <button class="btn" data-cam="${esc(d.room)}" type="button">♻️ Restart cameras</button>
          </div></div>`).join("")
      : `<p class="muted">No devices yet.</p>`;
  });
  list.onclick = (e) => {
    const b = (e.target as HTMLElement).closest("button") as HTMLElement | null;
    if (!b) return;
    if (b.dataset.buzz) cmdTestBuzzer(b.dataset.buzz);
    else if (b.dataset.cap) cmdCaptureBoard(b.dataset.cap);
    else if (b.dataset.cam) cmdRestartCamera(b.dataset.cam, "all");
  };
}
