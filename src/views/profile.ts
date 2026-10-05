import { dbList } from "../store";
import { state } from "../state";
import { $, esc, starsHtml } from "../helpers";
import type { Rating, UserProfile } from "../types";

export async function renderProfile(): Promise<void> {
  if (!state.profile) return;
  const me = state.profile;
  const root = $("#profile-root");
  root.innerHTML = `<div class="loading">Loading profile…</div>`;

  const users = await dbList<UserProfile>("users");
  const students = users.filter((u) => u.role === "student")
    .sort((a, b) => (b.airScore ?? 0) - (a.airScore ?? 0));
  const myRank = students.findIndex((s) => s.uid === me.uid) + 1;

  let html = `<div class="grid-2">
    <div class="card">
      <h3>👤 My Profile</h3>
      <div class="profile-row"><span>Name</span><b>${esc(me.name)}</b></div>
      <div class="profile-row"><span>Email</span><b>${esc(me.email)}</b></div>
      <div class="profile-row"><span>Role</span><b>${esc(me.role.toUpperCase())}</b></div>
      ${me.role === "student" ? `
        <div class="profile-row"><span>Student ID</span><b>${esc(me.studentId ?? "—")}</b></div>
        <div class="profile-row"><span>Class</span><b>${esc(me.className ?? "—")}</b></div>
        <div class="profile-row"><span>⚡ Air Score</span><b class="air">${me.airScore ?? 0}</b></div>
        <div class="profile-row"><span>Leaderboard Rank</span><b>${myRank ? "#" + myRank : "—"}</b></div>` : ""}
      ${me.role === "teacher" ? `
        <div class="profile-row"><span>Subject</span><b>${esc(me.subject ?? "—")}</b></div>
        <div class="profile-row"><span>Class</span><b>${esc(me.className ?? "—")}</b></div>` : ""}
    </div>
    <div class="card">
      <h3>🏆 Air Score Leaderboard (Student ID · Air Score)</h3>
      <ol class="leaderboard">
        ${students.slice(0, 10).map((s, i) => `
          <li class="${s.uid === me.uid ? "me" : ""}">
            <span class="rank">${["🥇", "🥈", "🥉"][i] ?? "#" + (i + 1)}</span>
            <span class="name">${esc(s.name)} <span class="muted">(${esc(s.studentId ?? "—")})</span></span>
            <span class="score">${s.airScore ?? 0}</span>
          </li>`).join("") || `<li class="muted">No students yet.</li>`}
      </ol>
    </div>
  </div>`;

  if (me.role === "teacher") {
    const ratings = await dbList<Rating>("ratings", { orderBy: ["createdAt", "desc"], limit: 100 });
    const mine = ratings.filter((r) => r.teacherUid === me.uid);
    const avg = mine.length ? mine.reduce((s, r) => s + (Number(r.stars) || 0), 0) / mine.length : 0;
    const badges: string[] = [];
    if (avg >= 4.5) badges.push("⭐ Star Educator");
    if (avg >= 4) badges.push("🏅 Inspiring Teacher");
    if (mine.length >= 5) badges.push("💬 Top Comments");
    html += `
    <div class="card">
      <h3>Teacher Performance — Achievements · Rating · Top Comments</h3>
      <div class="rating-summary">
        <div class="big-rating">${avg.toFixed(1)}<small>/5</small></div>
        <div>${starsHtml(avg)}<br><span class="muted">${mine.length} rating(s)</span></div>
      </div>
      <div class="badges">${badges.map((b) => `<span class="badge green">${b}</span>`).join("")
        || `<span class="badge muted">No achievements yet</span>`}</div>
      <h4>Top comments</h4>
      <ul class="comment-list">
        ${mine.slice(0, 5).map((r) => `<li><b>${esc(r.studentName ?? "Student")}</b> ${starsHtml(Number(r.stars) || 0)}
          <p>${esc(r.comment ?? "")}</p></li>`).join("") || `<li class="muted">No comments yet.</li>`}
      </ul>
    </div>`;
  }
  root.innerHTML = html;
}