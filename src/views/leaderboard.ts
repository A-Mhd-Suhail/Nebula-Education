import { state } from "../state";
import { dbList } from "../store";
import { classLabel } from "../catalog";
import { esc } from "../helpers";
import type { Doubt, Rating, UserProfile } from "../types";

export function render(root: HTMLElement): void {
  const me = state.profile!;
  let tab: "students" | "teachers" = me.role === "teacher" ? "teachers" : "students";

  root.innerHTML = `
    <div class="card"><h3>🏆 Leaderboard & AIR</h3>
      <div class="tabs">
        <button id="lb-students" class="btn" type="button">🎓 Students</button>
        <button id="lb-teachers" class="btn" type="button">🧑‍🏫 Teachers</button>
      </div>
      <p class="muted small">AIR = your rank inside this school. Students ranked by AIR score · teachers by ratings + doubts solved. Scores update via Cloud Functions.</p>
      <button id="lb-refresh" class="btn" type="button">↻ Refresh</button>
    </div>
    <div id="lb-body" class="stack"></div>`;
  const body = root.querySelector("#lb-body") as HTMLElement;
  const bS = root.querySelector("#lb-students") as HTMLButtonElement;
  const bT = root.querySelector("#lb-teachers") as HTMLButtonElement;

  const setTab = (t: "students" | "teachers") => {
    tab = t;
    bS.classList.toggle("active", t === "students");
    bT.classList.toggle("active", t === "teachers");
    void load();
  };
  bS.onclick = () => setTab("students");
  bT.onclick = () => setTab("teachers");
  (root.querySelector("#lb-refresh") as HTMLButtonElement).onclick = () => void load();

  const medal = (r: number) => (r === 1 ? "🥇" : r === 2 ? "🥈" : r === 3 ? "🥉" : `#${r}`);
  const table = (rows: { rank: number; name: string; extra: string; score: number; uid: string }[], kind: string) => `
    <div class="card"><table class="lb-table">
      <thead><tr><th>AIR</th><th>Name</th><th>${kind === "student" ? "Class" : "Stats"}</th><th>Score</th></tr></thead>
      <tbody>${rows.map((r) => `<tr class="${r.uid === me.uid ? "lb-me-row" : ""}">
        <td>${medal(r.rank)}</td><td>${esc(r.name)}</td><td>${esc(r.extra)}</td><td><b>${r.score}</b></td></tr>`).join("")}
      </tbody></table></div>`;

  async function load(): Promise<void> {
    body.innerHTML = `<p class="muted">Loading…</p>`;
    try {
      if (tab === "students") {
        const users = await dbList<UserProfile>("users", { where: [["role", "==", "student"]], limit: 500 });
        users.sort((a, b) => (b.airScore ?? 0) - (a.airScore ?? 0));
        const myRank = users.findIndex((u) => u.uid === me.uid);
        body.innerHTML =
          (me.role === "student" && myRank >= 0
            ? `<div class="card lb-me">Your AIR: <b>#${myRank + 1}</b> of ${users.length} · AIR score <b>${me.airScore ?? 0}</b></div>` : "") +
          table(users.slice(0, 30).map((u, i) => ({
            rank: i + 1, name: u.name, extra: classLabel(u.className), score: u.airScore ?? 0, uid: u.uid,
          })), "student");
      } else {
        const [teachers, ratings, doubts] = await Promise.all([
          dbList<UserProfile>("users", { where: [["role", "==", "teacher"]], limit: 200 }),
          dbList<Rating>("ratings", { limit: 500 }),
          dbList<Doubt>("doubts", { where: [["status", "==", "solved"]], limit: 300 }),
        ]);
        const rows = teachers.map((t) => {
          const rs = ratings.filter((r) => r.teacherUid === t.uid);
          const avg = rs.length ? rs.reduce((s, r) => s + (r.stars ?? 0), 0) / rs.length : 0;
          const solvedCount = doubts.filter((d) => d.answeredByUid === t.uid || d.answeredBy === t.name).length;
          const score = Math.round((avg / 5) * 70 + Math.min(1, solvedCount / 25) * 30);
          return { rank: 0, name: t.name, extra: `⭐ ${avg.toFixed(1)} (${rs.length}) · doubts solved ${solvedCount}`, score, uid: t.uid };
        }).sort((a, b) => b.score - a.score).slice(0, 30).map((r, i) => ({ ...r, rank: i + 1 }));
        body.innerHTML = table(rows, "teacher");
      }
    } catch (e) {
      body.innerHTML = `<p class="muted">Failed to load: ${esc((e as Error).message)}</p>`;
    }
  }
  setTab(tab);
}
