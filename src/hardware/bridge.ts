// src/hardware/bridge.ts — single init. Safe, silent, zero UI impact.
import { HW, hwEnabled } from "./config";
import { hwBus, type HWEvent, type HWEventType } from "./bus";
import * as realtime from "./realtime";
import { hwApi } from "./api";
import { loadConfig, setConfigLocal, CFG, clearTagCache, safeSet } from "./store";
import { startPresence } from "./presence";
import { routeEvent, ackIncident, syllabusProgress, startEngines } from "./engines";
import { startSimulator, stopSimulator, seedDemo } from "./simulator";

let started = false;

export function initHardware(): void {
  if (started || typeof window === "undefined") return;
  started = true;

  startEngines();
  startPresence();
  void loadConfig();
  window.setInterval(() => void loadConfig(), HW.cfgRefreshMs);

  hwBus.on((e: HWEvent) => { void routeEvent(e.type, e.roomId, e.deviceId, e.payload ?? {}); });

  if (HW.simulate) startSimulator();
  else if (hwEnabled()) realtime.connect();

  (window as unknown as Record<string, unknown>).__HW_BRIDGE__ = {
    status: realtime.wsStatus,
    recent: (n?: number) => hwBus.recent(n),
    emit: (e: Partial<HWEvent>) => hwBus.emit({ ...e, type: (e.type ?? "heartbeat") as HWEventType }),
    sendCommand: hwApi.sendCommand,
    bindTag: async (tag: string, uid: string): Promise<boolean> => {
      const ok = await safeSet("users", uid, { bleTag: tag });
      clearTagCache();
      return ok;
    },
    ackIncident,
    setConfig: (patch: Record<string, unknown>) => {
      setConfigLocal(patch as never);
      void safeSet("hardware", "config", patch);
      return CFG;
    },
    getConfig: (): typeof CFG => CFG,
    syllabusProgress,
    seedDemo,
    startSimulator,
    stopSimulator,
  };
}
