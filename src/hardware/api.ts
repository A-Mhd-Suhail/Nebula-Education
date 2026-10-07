// src/hardware/api.ts — software → hardware commands. Never throws.
import { HW } from "./config";

async function post(path: string, body: unknown, timeoutMs = 4000): Promise<unknown | null> {
  if (!HW.gatewayUrl) return null;
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(HW.gatewayUrl + path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    return res.ok ? await res.json() : null;
  } catch { return null; }
  finally { window.clearTimeout(t); }
}

export const hwApi = {
  sendCommand: (deviceCode: string, command: string, args: Record<string, unknown> = {}) =>
    post("/api/command", { device_code: deviceCode, command, args }),
};
