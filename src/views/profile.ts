import { getAirHistory } from "../airscore";
import { dbList } from "../store";
import { state } from "../state";
import { $, esc, starsHtml } from "../helpers";
import type { AirHistory, Rating, UserProfile } from "../types";

function orSoon(value: string | number | undefined, soonText: string): string {
  const v = typeof value === "number" ? value : String(value ?? "").trim();
  if (v === "" || v === "0" || v === 0) return `<span class="muted">${esc(soonText)}</span>`;
  return esc(v);
}

export async function renderProfile(): Promise<void> {
  if (!state.profile) return;
  const me = state.profile;
  const root = $("#profile-root");
  root.innerHTML = `<div class="loading">Loading profile…</div>`;

  const users = await dbList<UserProfile>("users");
  const students = users.filter((u) => u.role === "student").sort((a, b) => (b.airScore ?? 0) - (a.airScore ?? 0));
  const myRank = students.findIndex((s) => s.uid === me.uid) + 1;
  const history: AirHistory[] = me.role === "student" ? await getAirHistory(me.uid) : [];
  const lastBreakdown = history[history.length - 1]?.breakdown;

  let html = `<div class="grid-2">
    <div class="card">
      <h3>👤 My Profile</h3>
      <div class="profile-row"><span>Name</span><b>${esc(me.name)}</b></div>
      <div class="profile-row"><span>Email</span><b>${esc(me.email)}</b></div>
      <div class="profile-row"><span>Role</span><b>${esc(me.role.toUpperCase())}</b></div>
      ${me.role === "student" ? `
        <div class="profile-row"><span>Student ID</span><b>${orSoon(me.studentId, "To be generated soon…")}</b></div>
        <div class="profile-row"><span>Class</span><b>${orSoon(me.className, "To be updated soon…")}</b></div>
        <div class="profile-row"><span>⚡ Air Score</span><b>${orSoon(me.airScore, "To be calculated soon…")}</b></div>
        <div class="profile-row"><span>Leaderboard Rank</span><b>${myRank ? "#" + myRank : `<span class="muted">To be calculated soon…</span>`}</b></div>` : ""}
      ${me.role === "teacher" ? `
        <div class="profile-row"><span>Teacher ID</span><b>${orSoon(me.teacherId, "To be generated soon…")}</b></div>
        <div class="profile-row"><span>Subject</span><b>${orSoon(me.subject, "To be updated soon…")}</b></div>
        <div class="profile-row"><span>Class</span><b>${orSoon(me.className, "To be updated soon…")}</b></div>` : ""}
    </div>
    <div class="card">
      <h3>🏆 Air Score Leaderboard</h3>
      <ol class="leaderboard">
        ${students.slice(0, 10).map((s, i) => `
          <li class="${s.uid === me.uid ? "me" : ""}">
            <span class="rank">${["🥇", "🥈", "🥉"][i] ?? "#" + (i + 1)}</span>
            <span class="name">${esc(s.name)} <span class="muted">(${esc(s.studentId ?? "ID pending")})</span></span>
            <span class="score">${s.airScore ? s.airScore : `<span class="muted" style="font-weight:400;font-size:.85rem">soon…</span>`}</span>
          </li>`).join("") || `<li class="muted">No students yet.</li>`}
      </ol>
    </div>
  </div>`;

  if (me.role === "student") {
    html += `
    <div class="grid-2">
      <div class="card">
        <h3>⚡ Air Score Breakdown</h3>
        ${lastBreakdown ? `
          <div class="profile-row"><span>🚸 Attendance (${lastBreakdown.attPct ?? 0}%)</span><b>weight 25%</b></div>
          <div class="profile-row"><span>🛡️ Learning/Behavior (${lastBreakdown.learnPct ?? 100}%)</span><b>weight 25%</b></div>
          <div class="profile-row"><span>🧠 Quiz (${lastBreakdown.quizPct ?? 0}%)</span><b>weight 20%</b></div>
          <div class="profile-row"><span>📘 Assignments (${lastBreakdown.assPct ?? 0}%)</span><b>weight 15%</b></div>
          <div class="profile-row"><span>🙋 Participation (${lastBreakdown.partPct ?? 0}%)</span><b>weight 15%</b></div>
          <p class="muted">Weights are configurable by the HM in System Settings.</p>` :
          `<p class="muted">To be calculated soon… — it builds up automatically from attendance, quizzes, assignments and participation.</p>`}
      </div>
      <div class="card">
        <h3>📈 Air Score History</h3>
        ${history.length ? history.map((h) => `
          <div class="profile-row">
            <span>${h.reason ? esc(h.reason) : "update"}</span>
            <b>${h.total} <span class="muted" style="font-weight:400">${h.delta > 0 ? "▲" + h.delta : h.delta < 0 ? "▼" + Math.abs(h.delta) : "—"}</span></b>
          </div>`).join("") : `<p class="muted">No history yet — score updates as you learn.</p>`}
      </div>
    </div>`;
  }

  if (me.role === "teacher") {
    const ratings = await dbList<Rating>("ratings", { limit: 100 });
    const mine = ratings.filter((r) => r.teacherUid === me.uid).sort((a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0));
    const avg = mine.length ? mine.reduce((s, r) => s + (Number(r.stars) || 0), 0) / mine.length : 0;
    const badges: string[] = [];
    if (avg >= 4.5) badges.push("⭐ Star Educator");
    if (avg >= 4) badges.push("🏅 Inspiring Teacher");
    if (mine.length >= 5) badges.push("💬 Top Comments");
    html += `
    <div class="card">
      <h3>Teacher Performance — Achievements · Rating · Top Comments</h3>
      <div class="rating-summary">
        ${mine.length
          ? `<div class="big-rating">${avg.toFixed(1)}<small>/5</small></div><div>${starsHtml(avg)}<br><span class="muted">${mine.length} rating(s)</span></div>`
          : `<div class="big-rating">—</div><div><span class="muted">Rating: to be calculated soon…<br>(students rate you at the end of class)</span></div>`}
      </div>
      <div class="badges">${badges.map((b) => `<span class="badge green">${b}</span>`).join("") || `<span class="badge muted">Achievements: to be unlocked soon…</span>`}</div>
      <h4>Top comments</h4>
      <ul class="comment-list">
        ${mine.slice(0, 5).map((r) => `<li><b>${esc(r.studentName ?? "Student")}</b> ${starsHtml(Number(r.stars) || 0)}<p>${esc(r.comment ?? "")}</p></li>`).join("")
          || `<li class="muted">No comments yet.</li>`}
      </ul>
    </div>`;
  }
  root.innerHTML = html;
}