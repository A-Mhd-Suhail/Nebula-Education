--------------------------------------------------------------------------------
const functions = require("firebase-functions");
const admin = require("firebase-admin");
admin.initializeApp();

// Push to all HM devices when a critical incident is created
exports.onIncidentCreated = functions.firestore
  .document("incidents/{id}").onCreate(async (snap) => {
    const inc = snap.data();
    if (inc.priority !== "critical") return null;
    try {
      await admin.messaging().send({
        topic: "hm-alerts",
        notification: { title: "🚨 " + String(inc.type).toUpperCase(), body: String(inc.description || "") },
      });
    } catch (e) { console.error("FCM:", e); }
    return null;
  });

// Server-side AIR recompute — the only trustworthy writer.
exports.recomputeAirScore = functions.https.onCall(async (data, ctx) => {
  if (!ctx.auth) throw new functions.https.HttpsError("unauthenticated", "Sign in required");
  const caller = await admin.firestore().doc(`users/${ctx.auth.uid}`).get();
  if (!["hm", "meo", "deo", "admin"].includes(caller.data()?.role))
    throw new functions.https.HttpsError("permission-denied", "HM only");
  const uid = data.uid;
  const fs = admin.firestore();
  const [att, marks, subs] = await Promise.all([
    fs.collection("attendance").where("uid", "==", uid).get(),
    fs.collection("marks").where("studentUid", "==", uid).get(),
    fs.collection("submissions").where("studentUid", "==", uid).get(),
  ]);
  const days = new Set(), allDays = new Set();
  att.forEach((d) => { allDays.add(d.data().date); if (d.data().status === "present") days.add(d.data().date); });
  const attPct = allDays.size ? Math.min(100, Math.round(days.size / allDays.size * 100)) : 0;
  let qs = 0, qt = 0;
  marks.forEach((m) => { qs += m.data().score || 0; qt += m.data().total || 1; });
  const quizPct = qt ? Math.round(qs / qt * 100) : 0;
  let mg = 0, mm = 0;
  subs.forEach((s) => { const d = s.data();
    if (typeof d.marksGiven === "number" && (d.marksMax || 0) > 0) { mg += d.marksGiven; mm += d.marksMax; } });
  const assPct = mm ? Math.round(mg / mm * 100) : 0;
  const total = Math.round(attPct * 0.35 + quizPct * 0.4 + assPct * 0.25);
  await fs.doc(`users/${uid}`).set({ airScore: total }, { merge: true });
  await fs.collection("airHistory").add({ uid, total, reason: data.reason || "server", createdAt: Date.now() });
  return { total };
});

