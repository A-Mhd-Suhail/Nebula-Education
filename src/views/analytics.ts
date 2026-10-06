--------------------------------------------------------------------------------
import { dbList } from "../store";
import { esc, todayStr } from "../helpers";
import type { Attendance, Incident, NoiseEvent, UserProfile } from "../types";

export function render(root: HTMLElement): void {
  root.innerHTML = `<h3>📈 Analytics (last 7 days)</h3>
    <div class="card"><h4>Attendance % per day</h4><div id="an-att" class="bars"></div></div>
    <div class="grid2">
      <div class="card"><h4>Noise events per day</h4><div id="an-noise" class="bars"></div></div>
      <div class="card"><h4>Incidents by type (total)</h4><div id="an-inc" class="bars"></div></div></div>`;

  void (async () => {
    const localDate = (ts: number) => todayStr(new Date(ts));
    const days: string[] = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      days.push(todayStr(d));
    }
    const [att, users, noise, inc] = await Promise.all([
      dbList<Attendance>("attendance", { limit: 1000 }),
      dbList<UserProfile>("users", { limit: 500 }),
      dbList<NoiseEvent>("noiseEvents", { limit: 500 }),
      dbList<Incident>("incidents", { limit: 300 }),
    ]);
    const studentCount = users.filter((u) => u.role === "student").length || 1;
    const bars = (el: HTMLElement, arr: { label: string; pct: number; txt: string }[]) => {
      el.innerHTML = arr.map((b) => `<div class="bar-row"><span class="muted small" style="width:70px">${esc(b.label)}</span><div class="bar"><div class="bar-fill up" style="width:${b.pct}%"></div></div><b class="small">${esc(b.txt)}</b></div>`).join("");
    };
    bars(root.querySelector("#an-att") as HTMLElement,
      days.map((d) => {
        const p = att.filter((a) => a.date === d && a.status === "present").length;
        return { label: d.slice(5), pct: Math.min(100, Math.round(p / studentCount * 100)), txt: `${p}/${studentCount}` };
      }));
    bars(root.querySelector("#an-noise") as HTMLElement,
      days.map((d) => {
        const n = noise.filter((x) => localDate(x.createdAt) === d).length;
        return { label: d.slice(5), pct: Math.min(100, n * 5), txt: String(n) };
      }));
    bars(root.querySelector("#an-inc") as HTMLElement,
      ["fight", "noise", "misbehavior", "teacher_violation"].map((t) => {
        const n = inc.filter((i) => i.type === t).length;
        return { label: t, pct: Math.min(100, n * 10), txt: String(n) };
      }));
  })().catch((e) => { root.innerHTML += `<p class="muted">Failed: ${esc((e as Error).message)}</p>`; });
}
```

---

## What this fresh build fixes (all in one)

✅ Profile loads instantly with real live data · ✅ feed live for all roles · ✅ doubt → any teacher → solved → student notified · ✅ live notification center with NEW/READ sections + delete · ✅ separate student & teacher Leaderboard/AIR · ✅ searchable dropdowns (search + dropdown combined) for class/subject in registration, assignments & timetable · ✅ class-join PINs · ✅ locked Firestore rules · ✅ full Pi publisher + ESP32 firmware + Cloud Functions · ✅ exit-grace, no auto-penalty, Storage board images, timezone, dedupe, all §4 checklist bugs.

**Setup order:** paste files → `npm install` → `.env` → `npm run dev` → (optional) HiveMQ Cloud credentials in HM → System Config → Pi: `pip install -r requirements.txt` + `serviceAccount.json` → run. Want the ADXL345 fall firmware, CSV bulk-import, or parent portal next? Just say which.
