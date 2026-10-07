// src/hardware/store.ts — shared foundation for all 8 feature engines
import { auth, add, set, get, list } from "../firebase";
import type { User, Session } from "../firebase";
import { HW } from "./config";

/* ---------- thresholds: hardware/config doc overrides defaults (never hardcode) ---------- */
export interface HWConfig {
  dayStart: string;                 // "HH:MM" school start → lateness baseline
  attendanceLateAfterMin: number;
  presenceGapSec: number;           // no ping this long → person considered gone
  teacherEarlyExitMin: number;
  absenceAlertMin: number;          // teacher inactive/absent threshold
  noiseWarnDb: number;
  noiseHighDb: number;
  noiseMinDurationSec: number;
  buzzerSec: number;
  incidentMediumConf: number;
  incidentHighConf: number;
  engagementDisengageMin: number;
  engagementInterveneMin: number;
  syllabusMatchThreshold: number;   // 0..1 token overlap
}
export const DEFAULTS: HWConfig = {
  dayStart: "08:45",
  attendanceLateAfterMin: 10,
  presenceGapSec: 90,
  teacherEarlyExitMin: 5,
  absenceAlertMin: 5,
  noiseWarnDb: 60,
  noiseHighDb: 75,
  noiseMinDurationSec: 5,
  buzzerSec: 3,
  incidentMediumConf: 0.6,
  incidentHighConf: 0.85,
  engagementDisengageMin: 2,
  engagementInterveneMin: 5,
  syllabusMatchThreshold: 0.5,
};
export let CFG: HWConfig = { ...DEFAULTS };

let cfgAt = 0;
export async function loadConfig(): Promise<void> {
  if (Date.now() - cfgAt < HW.cfgRefreshMs) return;
  cfgAt = Date.now();
  try {
    const d = await get<Partial<HWConfig>>("hardware", "config");
    if (d) CFG = { ...DEFAULTS, ...d };
  } catch { /* keep defaults */ }
}
export function setConfigLocal(patch: Partial<HWConfig>): void { CFG = { ...CFG, ...patch }; }

/* ---------- auth-guarded writes (Firestore rules require login) ---------- */
let canWrite = false; let writeAt = 0;
export function canWriteDb(): boolean {
  if (Date.now() - writeAt > 30000) { canWrite = !!auth.currentUser; writeAt = Date.now(); }
  return canWrite;
}
export async function safeAdd(col: string, data: object): Promise<string | null> {
  if (!canWriteDb()) return null;
  try { return await add(col, data); } catch (e) { console.debug("[HW] add", col, e); return null; }
}
export async function safeSet(col: string, id: string, data: object): Promise<boolean> {
  if (!canWriteDb() || !id) return false;
  try { await set(col, id, data); return true; } catch (e) { console.debug("[HW] set", col, id, e); return false; }
}
export async function safeGet<T>(col: string, id: string): Promise<T | null> {
  try { return await get<T>(col, id); } catch { return null; }
}
export async function safeList<T>(col: string, w?: [string, unknown]): Promise<T[] | null> {
  try { return await list<T>(col, w); } catch { return null; }
}

/* ---------- time helpers ---------- */
export const todayKey = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};
export const dowToday = (): number => { const d = new Date().getDay(); return d === 0 ? 7 : d; }; // 1=Mon
export const minsOfDay = (): number => { const d = new Date(); return d.getHours() * 60 + d.getMinutes(); };
export const hhmmToMin = (s: string): number => {
  const [h, m] = s.split(":").map(Number);
  return (h || 0) * 60 + (m || 0);
};

/* ---------- BLE tag → user (cached) ---------- */
const tagCache = new Map<string, User | null>();
export async function userByTag(tag: string): Promise<User | null> {
  const t = tag.trim();
  if (!t) return null;
  if (tagCache.has(t)) return tagCache.get(t) ?? null;
  let u: User | null = null;
  const byBle = await safeList<User>("users", ["bleTag", t]);
  if (byBle && byBle.length) u = byBle[0];
  if (!u) {
    const byId = await safeList<User>("users", ["studentId", t]);
    if (byId && byId.length) u = byId[0];
  }
  tagCache.set(t, u);
  return u;
}
export function clearTagCache(): void { tagCache.clear(); }

/* ---------- live session cache ---------- */
let sess: Session[] = []; let sessAt = 0;
export async function liveSessions(): Promise<Session[]> {
  if (Date.now() - sessAt > 10000) {
    sess = (await safeList<Session>("sessions", ["active", true])) ?? [];
    sessAt = Date.now();
  }
  return sess;
}
export async function sessionForClass(cls?: string | null): Promise<Session | null> {
  if (!cls) return null;
  return (await liveSessions()).find((s) => s.className === cls) ?? null;
}

/* ---------- roomId → className (config doc hardware/rooms, else session match) ---------- */
let roomMap: Record<string, string> | null = null;
export async function roomToClass(roomId?: string | null): Promise<string | null> {
  if (!roomId) return null;
  if (roomMap === null) {
    const d = await safeGet<Record<string, string>>("hardware", "rooms");
    roomMap = d ?? {};
  }
  if (roomMap[roomId]) return roomMap[roomId];
  if ((await liveSessions()).some((s) => s.className === roomId)) return roomId;
  return null;
}

/* ---------- device heartbeat touch (throttled) ---------- */
const devAt = new Map<string, number>();
export async function touchDevice(deviceId?: string | null, roomId?: string | null, force = false): Promise<void> {
  if (!deviceId) return;
  const last = devAt.get(deviceId) ?? 0;
  if (!force && Date.now() - last < 30000) return;
  devAt.set(deviceId, Date.now());
  await safeSet("hardware_devices", deviceId, {
    code: deviceId, roomId: roomId ?? null, status: "online", lastSeen: Date.now(),
  });
}
