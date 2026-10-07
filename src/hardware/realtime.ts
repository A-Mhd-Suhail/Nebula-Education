// src/hardware/realtime.ts — reconnecting WS. Offline = silent retry, never an error.
import { HW, hwEnabled } from "./config";
import { hwBus, type HWEvent } from "./bus";

let ws: WebSocket | null = null;
let attempt = 0;
let stopped = false;
let ping: number | null = null;
let status: "offline" | "connecting" | "online" = "offline";

const setStatus = (s: typeof status): void => {
  if (status === s) return;
  status = s;
  hwBus.emit({ type: s === "online" ? "hw_connected" : "hw_disconnected" });
};

const startPing = (): void => {
  stopPing();
  ping = window.setInterval(() => {
    if (ws?.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ kind: "ping" })); } catch { /* ignore */ }
    }
  }, HW.pingMs);
};
const stopPing = (): void => { if (ping !== null) { clearInterval(ping); ping = null; } };

const retry = (): void => {
  if (stopped) return;
  window.setTimeout(connect, Math.min(HW.reconnectBaseMs * 2 ** attempt, HW.reconnectMaxMs));
  attempt += 1;
};

export function connect(): void {
  if (typeof window === "undefined" || !hwEnabled() || !HW.wsUrl) return;
  if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;
  stopped = false;
  setStatus("connecting");
  try { ws = new WebSocket(HW.wsUrl); }
  catch { setStatus("offline"); retry(); return; }

  ws.onopen = () => { attempt = 0; setStatus("online"); startPing(); };
  ws.onmessage = (msg) => {
    try {
      const d = JSON.parse(String(msg.data)) as Partial<HWEvent> & { kind?: string };
      if (d.kind === "ping" || d.kind === "pong") return;
      if (d.type) hwBus.emit({
        type: d.type, roomId: d.roomId, deviceId: d.deviceId, ts: d.ts,
        payload: d.payload ?? d,
      });
    } catch { /* ignore bad frame */ }
  };
  ws.onerror = () => { /* silent */ };
  ws.onclose = () => { stopPing(); setStatus("offline"); retry(); };
}

export function disconnect(): void {
  stopped = true;
  stopPing();
  try { ws?.close(); } catch { /* ignore */ }
  ws = null;
  setStatus("offline");
}

export const wsStatus = (): typeof status => status;
