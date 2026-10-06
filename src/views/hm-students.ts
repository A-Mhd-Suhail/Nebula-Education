import { deleteApp, initializeApp } from "firebase/app";
import { createUserWithEmailAndPassword, getAuth } from "firebase/auth";
import { doc, setDoc } from "firebase/firestore";
import { db, firebaseConfig } from "../firebase";
import { dbList } from "../store";
import { esc, showToast } from "../helpers";
import { recomputeAirScore } from "../airscore";
import { CLASS_LIST, classLabel } from "../catalog";
import { downloadCSV } from "../utils";
import type { UserProfile } from "../types";

export function render(root: HTMLElement): void {
  root.innerHTML = `
    <div class="card"><h3>🎓 Students</h3>
      <select id="hs-class" style="max-width:220px" aria-label="Filter by class"><option value="">All classes</option>${CLASS_LIST.map((c) => `<option value="${c.id}">${c.label}</option>`).join("")}</select>
      <button id="hs-refresh" class="btn" type="button">↻ Refresh</button>
      <div class="feed-actions" style="margin-top:10px">
        <input id="hs-csv" type="file" accept=".csv,text/csv" style="max-width:280px" aria-label="CSV file" />
        <button id="hs-tpl" class="btn" type="button">⬇ CSV template</button>
      </div>
      <p class="muted small">CSV columns: <code>name,email,class</code> — one student per line. Class must be an ID like <code>C10-A</code>. Temp password for imported students: <b>Nebula@123</b></p>
      <div id="hs-import-report"></div>
    </div>
    <div id="hs-list" class="stack"><p class="muted">Loading…</p></div>`;
  const listEl = root.querySelector("#hs-list") as HTMLElement;
  const reportEl = root.querySelector("#hs-import-report") as HTMLElement;

  async function load(): Promise<void> {
    const cls = (root.querySelector("#hs-class") as HTMLSelectElement).value;
    const students = await dbList<UserProfile>("users", { where: [["role", "==", "student"]], limit: 500 });
    const arr = students.filter((u) => !cls || u.className === cls).sort((a, b) => (b.airScore ?? 0) - (a.airScore ?? 0));
    listEl.innerHTML = arr.length
      ? `<div class="card"><table class="lb-table"><thead><tr><th>Name</th><th>Class</th><th>AIR</th><th>Behavior</th><th></th></tr></thead><tbody>
        ${arr.map((u) => `<tr><td>${esc(u.name)}</td><td>${classLabel(u.className)}</td><td>${u.airScore ?? 0}</td><td>${u.behaviorScore ?? 100}</td>
        <td><button class="btn" data-rec="${u.uid}" type="button" aria-label="Recompute ${esc(u.name)}">↻</button></td></tr>`).join("")}</tbody></table></div>`
      : `<p class="muted">No students found.</p>`;
  }

  (root.querySelector("#hs-class") as HTMLSelectElement).onchange = () => void load();
  (root.querySelector("#hs-refresh") as HTMLButtonElement).onclick = () => void load();

  (root.querySelector("#hs-tpl") as HTMLButtonElement).onclick = () =>
    downloadCSV("nebula-students-template.csv", [
      ["name", "email", "class"],
      ["Ravi Kumar", "ravi@example.com", "C10-A"],
      ["Priya Rao", "priya@example.com", "C9-B"],
    ]);

  (root.querySelector("#hs-csv") as HTMLInputElement).onchange = async (e) => {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) await importCsv(file);
  };

  /** POLISH #10 — bulk import. Uses a SECONDARY Firebase app so the HM's own
      session is never replaced by the created student accounts. */
  async function importCsv(file: File): Promise<void> {
    reportEl.innerHTML = `<p class="muted">Importing…</p>`;
    const text = await file.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    const rows = lines.filter((l) => !/^name\s*,/i.test(l));
    const sec = initializeApp(firebaseConfig, "nebula-bulk-" + Date.now());
    const secAuth = getAuth(sec);
    let ok = 0;
    const fails: string[] = [];
    for (const line of rows) {
      const [name, email, classId] = line.split(",").map((s) => (s ?? "").trim());
      if (!name || !email || !classId) { fails.push(`${line} — need name,email,class`); continue; }
      if (!CLASS_LIST.some((c) => c.id === classId)) { fails.push(`${email} — unknown class "${classId}" (use IDs like C10-A)`); continue; }
      try {
        const cred = await createUserWithEmailAndPassword(secAuth, email, "Nebula@123");
        await setDoc(doc(db, "users", cred.user.uid), {
          uid: cred.user.uid, name, email, role: "student",
          studentId: "STU-" + (Date.now().toString(36) + ok).toUpperCase(),
          className: classId, airScore: 0, behaviorScore: 100, createdAt: Date.now(),
        });
        ok++;
      } catch (err) { fails.push(`${email} — ${(err as Error).message}`); }
    }
    await deleteApp(sec).catch(() => { /* ignore */ });
    reportEl.innerHTML = `<div class="card small-card"><b>Import done:</b> ✅ ${ok} created · ❌ ${fails.length} failed` +
      (fails.length ? `<ul class="small">${fails.map((f) => `<li>${esc(f)}</li>`).join("")}</ul>` : "") + `</div>`;
    showToast(`Imported ${ok} students ✅`);
    void load();
  }

  listEl.onclick = async (e) => {
    const b = (e.target as HTMLElement).closest("button[data-rec]") as HTMLElement | null;
    if (!b) return;
    showToast("Recomputing…");
    const s = await recomputeAirScore(b.dataset.rec!, "hm manual");
    showToast(s === null ? "Failed — are Cloud Functions deployed?" : `New AIR: ${s}`);
    void load();
  };
  void load();
}
