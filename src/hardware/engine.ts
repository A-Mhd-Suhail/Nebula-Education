import { add, get, list, set } from "../firebase";
import type { Attendance, User } from "../firebase";
import { todayStr } from "../ui";
import { hwBus, type HWEvent } from "./bus";
import { hwApi } from "./api";

interface HWConfig { noiseWarnDb: number; noiseHighDb: number; buzzerSec: number; incidentMediumConf: number; incidentHighConf: number; }
const DEFAULTS: HWConfig = { noiseWarnDb: 60, noiseHighDb: 75, buzzerSec: 3, incidentMediumConf: 0.6, incidentHighConf: 0.85 };
let config: HWConfig = { ...DEFAULTS };
async function loadConfig(): Promise<void> { try { const saved = await get<Partial<HWConfig>>("hardware", "config"); if (saved) config = { ...DEFAULTS, ...saved }; } catch { /* defaults remain active */ } }

const tagCache = new Map<string, User | null>();
async function resolveTag(tag: string): Promise<User | null> {
  const normalized = tag.trim(); if (!normalized) return null; if (tagCache.has(normalized)) return tagCache.get(normalized) ?? null;
  let user: User | null = null;
  try { const byBle = await list<User>("users", ["bleTag", normalized]); user = byBle[0] ?? null; if (!user) { const byId = await list<User>("users", ["studentId", normalized]); user = byId[0] ?? null; } } catch { user = null; }
  tagCache.set(normalized, user); return user;
}
export function clearTagCache(): void { tagCache.clear(); }

const seenToday = new Set<string>();
let attendanceLoaded = false;
async function markAttendance(user: User, method: string): Promise<void> {
  if (!attendanceLoaded) { try { const rows = await list<Attendance>("attendance", ["date", todayStr()]); rows.forEach((row) => seenToday.add(row.uid)); } catch { /* offline */ } attendanceLoaded = true; }
  if (seenToday.has(user.uid)) return;
  seenToday.add(user.uid);
  await set("attendance", `${user.uid}-${todayStr()}`, { date: todayStr(), uid: user.uid, name: user.name, role: user.role, method, createdAt: Date.now() });
}
async function logEvent(kind: string, event: HWEvent, extra: Record<string, unknown> = {}): Promise<void> { await add("hardware_events", { kind, roomId: event.roomId ?? null, deviceId: event.deviceId ?? null, payload: event.payload ?? {}, createdAt: Date.now(), ...extra }); }

async function onBlePing(event: HWEvent): Promise<void> { const tag = String((event.payload as { tag_id?: string } | undefined)?.tag_id ?? ""); const user = await resolveTag(tag); if (!user) return; try { await markAttendance(user, "ble-tag"); } catch (error) { console.debug("[HW] attendance write skipped", error); } }
async function onNoise(event: HWEvent): Promise<void> { const db = Number((event.payload as { db_level?: unknown } | undefined)?.db_level ?? 0); if (!db) return; const level = db >= config.noiseHighDb ? "high" : db >= config.noiseWarnDb ? "warning" : "ok"; try { if (level !== "ok") await logEvent("noise", event, { dbLevel: db, level }); if (level === "high" && event.deviceId) void hwApi.sendCommand(event.deviceId, "buzzer_on", { duration: config.buzzerSec }); } catch (error) { console.debug("[HW] noise log skipped", error); } }
async function onCamera(event: HWEvent): Promise<void> { const payload = (event.payload ?? {}) as { event_type?: string; confidence?: number }; const confidence = Number(payload.confidence ?? 0); if (confidence < config.incidentMediumConf) return; const severity = confidence >= config.incidentHighConf ? "high" : "medium"; try { await logEvent("incident", event, { eventType: payload.event_type ?? "other", confidence, severity }); } catch (error) { console.debug("[HW] incident log skipped", error); } }
async function onHeartbeat(event: HWEvent): Promise<void> { if (!event.deviceId) return; try { await set("hardware_devices", event.deviceId, { code: event.deviceId, roomId: event.roomId ?? null, status: "online", lastSeen: Date.now() }); } catch (error) { console.debug("[HW] heartbeat skipped", error); } }

export function startEngine(): void {
  void loadConfig();
  hwBus.on((event) => { switch (event.type) { case "ble_ping": void onBlePing(event); break; case "noise": void onNoise(event); break; case "camera_event": void onCamera(event); break; case "heartbeat": case "device_status": void onHeartbeat(event); break; default: break; } });
}
