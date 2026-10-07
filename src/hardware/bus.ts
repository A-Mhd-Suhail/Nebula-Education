// src/hardware/bus.ts
export type HWEventType =
  | "ble_ping" | "noise" | "camera_event" | "board_change" | "heartbeat"
  | "engagement" | "teacher_activity" | "syllabus_detect"
  | "device_status" | "command"
  | "hw_connected" | "hw_disconnected";

export interface HWEvent {
  type: HWEventType;
  roomId?: string;
  deviceId?: string;
  ts?: string;
  payload?: Record<string, unknown>;
}

type Handler = (e: HWEvent) => void;

class Bus {
  private handlers = new Set<Handler>();
  private log: HWEvent[] = [];
  on(h: Handler): () => void { this.handlers.add(h); return () => { this.handlers.delete(h); }; }
  emit(e: HWEvent): void {
    this.log.push(e);
    if (this.log.length > 300) this.log.shift();
    this.handlers.forEach((h) => { try { h(e); } catch (err) { console.debug("[HW] handler", err); } });
  }
  recent(n = 30): HWEvent[] { return this.log.slice(-n); }
}

export const hwBus = new Bus();
