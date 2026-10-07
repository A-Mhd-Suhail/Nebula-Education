// src/hardware/presence.ts — who is in which room, arrivals & departures
import type { User } from "../firebase";
import { CFG } from "./store";

interface Entry { user: User; roomId: string; lastSeen: number; }
const active = new Map<string, Entry>();
type ArriveCb = (tag: string, user: User, roomId: string) => void;
type LeaveCb = (tag: string, user: User, roomId: string, stayedSec: number) => void;
const arriveCbs = new Set<ArriveCb>();
const leaveCbs = new Set<LeaveCb>();
let started = false;

export function onPersonArrive(cb: ArriveCb): () => void {
  arriveCbs.add(cb);
  return () => { arriveCbs.delete(cb); };
}
export function onPersonLeave(cb: LeaveCb): () => void {
  leaveCbs.add(cb);
  return () => { leaveCbs.delete(cb); };
}

export function presenceTouch(tag: string, user: User, roomId: string): boolean {
  const ex = active.get(tag);
  if (ex) { ex.lastSeen = Date.now(); ex.roomId = roomId || ex.roomId; return false; }
  active.set(tag, { user, roomId, lastSeen: Date.now() });
  arriveCbs.forEach((cb) => { try { cb(tag, user, roomId); } catch { /* ignore */ } });
  return true;
}

function sweep(): void {
  const now = Date.now();
  for (const [tag, e] of [...active.entries()]) {
    if (now - e.lastSeen > CFG.presenceGapSec * 1000) {
      active.delete(tag);
      const stayed = Math.round((now - e.lastSeen) / 1000);
      leaveCbs.forEach((cb) => { try { cb(tag, e.user, e.roomId, stayed); } catch { /* ignore */ } });
    }
  }
}

export function startPresence(): void {
  if (started || typeof window === "undefined") return;
  started = true;
  window.setInterval(sweep, 5000);
}
