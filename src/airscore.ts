import { getFunctions, httpsCallable } from "firebase/functions";
import { app } from "./firebase";
import { dbList } from "./store";
import type { AirHistory } from "./types";

/**
 * Both score engines live in Cloud Functions now (security: clients can't fake
 * scores; weights come from settings/hardware.airWeights). If the functions are
 * not deployed, this logs an error and returns null — deploy with:
 *   firebase deploy --only functions
 */
async function callScore(name: string, uid: string, reason: string): Promise<number | null> {
  try {
    const fn = httpsCallable<{ uid: string; reason: string }, { total: number }>(getFunctions(app), name);
    const res = await fn({ uid, reason });
    return res.data.total;
  } catch (e) {
    console.error(`${name} failed — did you run \`firebase deploy --only functions\`?`, e);
    return null;
  }
}

export function recomputeAirScore(uid: string, reason = ""): Promise<number | null> {
  return callScore("recomputeAirScore", uid, reason);
}

export function recomputeTeacherScore(uid: string, reason = ""): Promise<number | null> {
  return callScore("recomputeTeacherScore", uid, reason);
}

export async function getAirHistory(uid: string): Promise<AirHistory[]> {
  const rows = await dbList<AirHistory>("airHistory", { where: [["uid", "==", uid]], limit: 50 });
  return rows.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)).slice(-12);
}
