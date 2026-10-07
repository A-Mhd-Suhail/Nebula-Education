// src/hardware/simulator.ts — fake devices for every feature (VITE_HW_SIMULATE=1)
import { hwBus, type HWEvent } from "./bus";
import { canWriteDb, safeList, safeSet, safeAdd, todayKey, dowToday, minsOfDay } from "./store";
import type { User } from "../firebase";

let timers: number[] = [];
let bound = false;
const emit = (type: HWEvent["type"], payload: Record<string, unknown>, roomId = "room-101"): void =>
  hwBus.emit({ type, roomId, deviceId: "SIM-1", payload });

async function bindDemoTags(): Promise<void> {
  if (bound || !canWriteDb()) return;
  bound = true;
  const users = (await safeList<User>("users")) ?? [];
  const stu = users.find((u) => u.role === "student");
  const tch = users.find((u) => u.role === "teacher");
  if (stu) await safeSet("users", stu.uid, { bleTag: "SIM-STU-1" });
  if (tch) await safeSet("users", tch.uid, { bleTag: "SIM-TCH-1" });
}

/** Seeds a timetable slot + syllabus topic for today so features 2 & 5 visibly trigger. */
export async function seedDemo(): Promise<void> {
  if (!canWriteDb()) { console.info("[HW] login first, then seedDemo()"); return; }
  const users = (await safeList<User>("users")) ?? [];
  const tch = users.find((u) => u.role === "teacher");
  if (!tch) { console.info("[HW] no teacher account"); return; }
  const m = minsOfDay();
  const slot = {
    teacherUid: tch.uid, className: tch.className ?? "Class 10-A",
    subject: tch.subject ?? "General", dow: dowToday(),
    startMin: Math.max(0, m - 15), endMin: m + 45,
  };
  await safeAdd("timetable", slot);
  await safeAdd("syllabus", {
    date: todayKey(), subject: slot.subject,
    topic: "Newton's second law of motion",
    doneTeacher: false, doneAI: false, createdAt: Date.now(),
  });
  console.info("[HW] demo slot + topic created for", slot.className);
}

export function startSimulator(): void {
  stopSimulator();
  void bindDemoTags();
  timers.push(window.setInterval(() => void bindDemoTags(), 20000));
  // F1 + F2 + F6: student & teacher pings
  timers.push(window.setInterval(() => emit("ble_ping", { tag_id: "SIM-STU-1", rssi: -60 }), 5000));
  timers.push(window.setInterval(() => emit("ble_ping", { tag_id: "SIM-TCH-1", rssi: -55 }), 5000));
  // F7: noise
  timers.push(window.setInterval(() => emit("noise", { db_level: Math.round(40 + Math.random() * 45) }), 4000));
  // F4: low engagement signals → intervention after configured minutes
  timers.push(window.setInterval(() => emit("engagement", {
    tag: "SIM-STU-1", signals: { head_forward: 0.08, activity: 0.12, tab_active: 0.15 },
  }), 20000));
  // F3: incident
  timers.push(window.setInterval(() => emit("camera_event", { event_type: "fight", confidence: 0.91 }), 45000));
  // F8 (+F5): board OCR → syllabus verify → student Tab note
  timers.push(window.setInterval(() => emit("board_change", { ocr_text: "Newton's second law F = ma" }), 60000));
  // F6: teacher inactivity alert
  timers.push(window.setInterval(() => emit("teacher_activity", {
    tag: "SIM-TCH-1", event_type: "inactive", duration_sec: 420,
  }), 50000));
  timers.push(window.setInterval(() => emit("heartbeat", { ok: true }), 30000));
}

export function stopSimulator(): void {
  timers.forEach((t) => clearInterval(t));
  timers = [];
  // Tip: stopping the simulator ends BLE pings → presence sweep records exits
  // (teacher early-exit, student exit time) after presenceGapSec.
}
