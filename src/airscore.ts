import { dbAdd, dbGet, dbList, dbSet } from "./store";
import type {
  AirHistory, AirScoreWeights, Attendance, Doubt, FeedPost,
  MarkEntry, Project, Submission, UserProfile,
} from "./types";

const DEFAULTS: AirScoreWeights = { attendance: 25, learning: 25, quiz: 20, assignments: 15, participation: 15 };

export async function getWeights(): Promise<AirScoreWeights> {
  const s = await dbGet<{ airWeights?: AirScoreWeights }>("settings", "hardware");
  return { ...DEFAULTS, ...(s?.airWeights ?? {}) };
}

/** Central scoring engine — recomputes and stores history. Weights configurable in System Config. */
export async function recomputeAirScore(uid: string, reason = ""): Promise<number | null> {
  const me = await dbGet<UserProfile>("users", uid);
  if (!me) return null;
  const w = await getWeights();

  const att = await dbList<Attendance>("attendance", { where: [["uid", "==", uid]] });
  const myDays = new Set(att.filter((a) => a.status === "present").map((a) => a.date));
  const allAtt = await dbList<Attendance>("attendance", {});
  const allDays = new Set(allAtt.map((a) => a.date));
  const attPct = allDays.size ? Math.min(100, Math.round((myDays.size / allDays.size) * 100)) : 0;

  const learnPct = me.behaviorScore ?? 100;

  const marks = await dbList<MarkEntry>("marks", { where: [["studentUid", "==", uid]] });
  const qs = marks.reduce((s, m) => s + (m.score ?? 0), 0);
  const qt = marks.reduce((s, m) => s + (m.total ?? 1), 0);
  const quizPct = qt ? Math.round((qs / qt) * 100) : 0;

  const subs = await dbList<Submission>("submissions", { where: [["studentUid", "==", uid]] });
  const marked = subs.filter((s) => typeof s.marksGiven === "number" && (s.marksMax ?? 0) > 0);
  const assPct = marked.length
    ? Math.round((marked.reduce((s, x) => s + (x.marksGiven ?? 0), 0) / marked.reduce((s, x) => s + (x.marksMax ?? 0), 0)) * 100)
    : 0;

  const [doubts, projects, posts] = await Promise.all([
    dbList<Doubt>("doubts", { where: [["studentUid", "==", uid]] }),
    dbList<Project>("projects", { where: [["studentUid", "==", uid]] }),
    dbList<FeedPost>("feed", { where: [["authorUid", "==", uid]] }),
  ]);
  const partPct = Math.min(100, (doubts.length + projects.length + posts.length) * 10);

  const total = Math.round(
    attPct * (w.attendance / 100) + learnPct * (w.learning / 100) +
    quizPct * (w.quiz / 100) + assPct * (w.assignments / 100) + partPct * (w.participation / 100));

  const prev = me.airScore ?? 0;
  await dbSet("users", uid, { airScore: total });
  await dbAdd("airHistory", {
    uid, total, delta: total - prev, reason,
    breakdown: { attPct, learnPct, quizPct, assPct, partPct },
    createdAt: Date.now(),
  });
  return total;
}

export async function getAirHistory(uid: string): Promise<AirHistory[]> {
  const rows = await dbList<AirHistory>("airHistory", { where: [["uid", "==", uid]] });
  return rows.sort((a, b) => (a.createdAt ?? 0) - (b.createdAt ?? 0)).slice(-12);
}