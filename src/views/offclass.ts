import { state } from "../state";
import { dbList, dbWatch } from "../store";
import { esc, todayStr } from "../helpers";
import type { MarkEntry, SyllabusTopic } from "../types";

export function render(root: HTMLElement): void {
  const me = state.profile!;
  root.innerHTML = `
    <div class="grid2">
      <div class="card"><h3>📚 Today's syllabus plan</h3><div id="oc-syl"><p class="muted">Loading…</p></div></div>
      <div class="card"><h3>🧮 My marks</h3><div id="oc-marks"><p class="muted">Loading…</p></div></div>
    </div>`;
  const syl = root.querySelector("#oc-syl") as HTMLElement;
  const marksEl = root.querySelector("#oc-marks") as HTMLElement;

  dbWatch<SyllabusTopic>("syllabus", { where: [["date", "==", todayStr()]], limit: 30 }, (rows) => {
    const list = rows.sort((a, b) => a.subject.localeCompare(b.subject));
    syl.innerHTML = list.length
      ? `<table class="lb-table"><thead><tr><th>Subject</th><th>Topic</th><th>Status</th></tr></thead><tbody>${list.map((t) => `<tr><td>${esc(t.subject)}</td><td>${esc(t.topic)}</td><td>${t.doneByTeacher || t.doneByAI ? "✅" : "⏳"}</td></tr>`).join("")}</tbody></table>`
      : `<p class="muted">No plan for today yet.</p>`;
  });

  void dbList<MarkEntry>("marks", { where: [["studentUid", "==", me.uid]], limit: 100 }).then((rows) => {
    const list = rows.sort((a, b) => b.createdAt - a.createdAt).slice(0, 20);
    marksEl.innerHTML = list.length
      ? `<table class="lb-table"><thead><tr><th>Exam</th><th>Subject</th><th>Score</th></tr></thead><tbody>${list.map((m) => `<tr><td>${esc(m.exam)}</td><td>${esc(m.subject)}</td><td>${m.score}/${m.total}</td></tr>`).join("")}</tbody></table>`
      : `<p class="muted">No marks yet.</p>`;
  }).catch(() => { marksEl.innerHTML = `<p class="muted">Failed to load marks.</p>`; });
}
