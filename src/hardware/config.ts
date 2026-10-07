// src/hardware/config.ts
const env = (k: string): string =>
  String(import.meta.env[k] ?? "").trim().replace(/^["']|["']$/g, "");

const gw = env("VITE_HW_GATEWAY_URL").replace(/\/+$/, "");

export const HW = {
  gatewayUrl: gw,
  wsUrl:
    env("VITE_HW_WS_URL") ||
    (gw.startsWith("https") ? "wss://" + gw.slice(8) + "/ws"
      : gw.startsWith("http") ? "ws://" + gw.slice(7) + "/ws"
      : ""),
  simulate: env("VITE_HW_SIMULATE") === "1",
  reconnectBaseMs: 1000,
  reconnectMaxMs: 15000,
  pingMs: 25000,
  cfgRefreshMs: 60000,
};

export const hwEnabled = (): boolean => !!HW.gatewayUrl || HW.simulate;
