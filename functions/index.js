const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

const STAFF = ["hm", "meo", "deo", "admin"];
const DEFAULT_WEIGHTS = { attendance: 25, learning: 25, quiz: 20, assignments: 15, participation: 15 };

// ============ 1) Push to all HM devices when a critical incident is created ============
exports.onIncidentCreated = functions.firestore
  .document("incidents/{id}").onCreate(async (snap) => {
    const inc = snap.data();
    if (inc.priority !== "critical") return null;
    try {
      await admin.messaging().send({
        topic: "hm-alerts",
        notification: { title: "🚨 " + String(inc.type || "incident").toUpperCase(), body: String(inc.description || "") },
      });
    } catch (e) { console.error("FCM:", e); }
    return null;
  });

// ============ 2) STUDENT AIR recompute (server-side — clients can't fake it) ============
exports.recomputeAirScore = functions.https.onCall(async (data, ctx) => {
  if (!ctx.auth) throw new functions.https.HttpsError("unauthenticated", "Sign in required");
  const uid = data.uid;
  const fs = admin.firestore();
  const caller = await fs.doc(`users/${ctx.auth.uid}`).get();
  const isStaff = STAFF.includes(caller.data()?.role);
  if (ctx.auth.uid !== uid && !isStaff)
    throw new functions.https.HttpsError("permission-denied", "Not allowed");

  const [cfg, me, attMine, attAll, marks, subs, doubts, projects, posts] = await Promise.all([
    fs.doc("settings/hardware").get(),
    fs.doc(`users/${uid}`).get(),
    fs.collection("attendance").where("uid", "==", uid).limit(400).get(),
    fs.collection("attendance").limit(1000).get(),
    fs.collection("marks").where("studentUid", "==", uid).limit(300).get(),
    fs.collection("submissions").where("studentUid", "==", uid).limit(300).get(),
    fs.collection("doubts").where("studentUid", "==", uid).limit(100).get(),
    fs.collection("projects").where("studentUid", "==", uid).limit(100).get(),
    fs.collection("feed").where("authorUid", "==", uid).limit(100).get(),
  ]);

  // Weights come from the HM config panel — no more hardcoded values (BUG #11)
  const w = cfg.data()?.airWeights || DEFAULT_WEIGHTS;

  const myDays = new Set(), allDays = new Set();
  attMine.forEach((d) => { if (d.data().status === "present") myDays.add(d.data().date); });
  attAll.forEach((d) => allDays.add(d.data().date));
  const attPct = allDays.size ? Math.min(100, Math.round(myDays.size / allDays.size * 100)) : 0;
  const learnPct = me.data()?.behaviorScore ?? 100;

  let qs = 0, qt = 0;
  marks.forEach((m) => { qs += m.data().score || 0; qt += m.data().total || 1; });
  const quizPct = qt ? Math.round(qs / qt * 100) : 0;

  let mg = 0, mm = 0;
  subs.forEach((s) => { const d = s.data();
    if (typeof d.marksGiven === "number" && (d.marksMax || 0) > 0) { mg += d.marksGiven; mm += d.marksMax; } });
  const assPct = mm ? Math.round(mg / mm * 100) : 0;

  const partPct = Math.min(100, (doubts.size + projects.size + posts.size) * 10);

  const total = Math.round(
    attPct * (w.attendance / 100) + learnPct * (w.learning / 100) +
    quizPct * (w.quiz / 100) + assPct * (w.assignments / 100) + partPct * (w.participation / 100));

  const prev = me.data()?.airScore ?? 0;
  await fs.doc(`users/${uid}`).set({ airScore: total }, { merge: true });
  await fs.collection("airHistory").add({
    uid, total, delta: total - prev, reason: data.reason || "recompute",
    breakdown: { attPct, learnPct, quizPct, assPct, partPct }, createdAt: Date.now(),
  });
  return { total };
});

// ============ 3) TEACHER AIR recompute (was never called anywhere — BUG #4b) ============
exports.recomputeTeacherScore = functions.https.onCall(async (data, ctx) => {
  if (!ctx.auth) throw new functions.https.HttpsError("unauthenticated", "Sign in required");
  const uid = data.uid;
  const fs = admin.firestore();
  const caller = await fs.doc(`users/${ctx.auth.uid}`).get();
  const isSelf = ctx.auth.uid === uid;
  const isStaff = STAFF.includes(caller.data()?.role);
  if (!isSelf && !isStaff)
    throw new functions.https.HttpsError("permission-denied", "Not allowed");

  const [ratings, doubts, sessions] = await Promise.all([
    fs.collection("ratings").where("teacherUid", "==", uid).limit(500).get(),
    fs.collection("doubts").where("answeredByUid", "==", uid).limit(300).get(),
    fs.collection("sessions").where("teacherUid", "==", uid).limit(300).get(),
  ]);

  const n = ratings.size;
  const avg = n ? [...ratings.docs].reduce((s, d) => s + (d.data().stars || 0), 0) / n : 0;
  const ratingPct = (avg / 5) * 100;
  const solvePct = Math.min(100, doubts.size * 10);
  const teachPct = Math.min(100, sessions.size * 5);
  const total = Math.round(ratingPct * 0.5 + solvePct * 0.25 + teachPct * 0.25);

  const me = await fs.doc(`users/${uid}`).get();
  const prev = me.data()?.airScore ?? 0;
  await fs.doc(`users/${uid}`).set({ airScore: total }, { merge: true });
  await fs.collection("airHistory").add({
    uid, total, delta: total - prev, reason: data.reason || "teacher recompute",
    breakdown: { ratingPct, solvePct, teachPct }, createdAt: Date.now(),
  });
  return { total };
});

// ============ 4) Subscribe an HM browser/device to the "hm-alerts" FCM topic ============
exports.subscribeHmPush = functions.https.onCall(async (data, ctx) => {
  if (!ctx.auth) throw new functions.https.HttpsError("unauthenticated", "Sign in required");
  const caller = await admin.firestore().doc(`users/${ctx.auth.uid}`).get();
  if (!STAFF.includes(caller.data()?.role))
    throw new functions.https.HttpsError("permission-denied", "Staff only");
  const token = data && data.token;
  if (typeof token !== "string" || token.length < 10)
    throw new functions.https.HttpsError("invalid-argument", "token required");
  await admin.messaging().subscribeToTopic([token], "hm-alerts");
  return { ok: true };
});
