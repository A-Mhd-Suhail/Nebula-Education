// src/student/MyClassroom.tsx — home, calendar, syllabus tracker, work, structured notes, doubts
import { useMemo, useState } from "react";
import { db, add, update, arrayUnion, arrayRemove } from "../firebase";
import type { Assignment, Session, Topic, User } from "../firebase";
import { doc, deleteDoc } from "firebase/firestore";
import { todayStr } from "../ui";
import type { Notify } from "../views";
import ProfilePage from "../social/ProfilePage";
import { Avatar, Bar, Empty } from "../social/kit";
import { useCol, todayISO, structureNotes, saveNote, type NoteDoc, type AnnDoc, type EventDoc } from "../social/data";
import "../social/social.css";

type Tab = "home" | "calendar" | "syllabus" | "work" | "notes" | "doubts";
interface BC { id: string; sessionId?: string; ocrText?: string; createdAt: number; }
interface DoubtRow { id: string; subject: string; question: string; status: string; answer?: string; answeredBy?: string; visibility?: string; toTeacherName?: string; createdAt: number; }
interface MarkRow { id: string; exam: string; subject: string; score: number; total: number; createdAt: number; }

export default function MyClassroom({ me, notify }: { me: User; notify: Notify }): JSX.Element {
  const [tab, setTab] = useState<Tab>("home");
  const [viewUid, setViewUid] = useState<string | null>(null);
  const users = useCol<User>("users");
  const topics = useCol<Topic>("syllabus");
  const events = useCol<EventDoc>("events");
  const notices = useCol<AnnDoc>("announcements");
  const assigns = useCol<Assignment>("assignments");
  const notes = useCol<NoteDoc>("notes", ["className", me.className ?? "—"]).slice().sort((a, b) => b.at - a.at);
  const myDoubts = useCol<DoubtRow>("doubts", ["studentUid", me.uid]).slice().sort((a, b) => b.createdAt - a.createdAt);
  const marks = useCol<MarkRow>("marks", ["studentUid", me.uid]);
  const sessions = useCol<Session>("sessions");
  const captures = useCol<BC>("boardCaptures");

  const mentor = users.find((u) => u.role === "teacher" && u.className === me.className) ?? null;
  const classmates = users.filter((u) => u.role === "student" && u.className === me.className)
    .slice().sort((a, b) => b.airScore - a.airScore);

  const sidClass = useMemo(() => {
    const m = new Map<string, string>();
    sessions.forEach((s) => m.set(s.id, s.className));
    return m;
  }, [sessions]);
  const boardNotes = captures.filter((c) => c.ocrText && c.sessionId && sidClass.get(c.sessionId) === me.className)
    .slice().sort((a, b) => b.createdAt - a.createdAt);

  if (viewUid) return <ProfilePage me={me} notify={notify} uid={viewUid} onBack={() => setViewUid(null)} />;

  return (
    <>
      <div className="tabs">
        {([["home", "🏠 Home"], ["calendar", "🗓 Calendar"], ["syllabus", "📚 Syllabus"], ["work", "📝 Work"], ["notes", "🧠 Notes"], ["doubts", "❓ Doubts"]] as Array<[Tab, string]>).map(([k, l]) => (
          <button key={k} type="button" className={`tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "home" && (
        <>
          <div className="card">
            <h3>👨‍🏫 Your mentor</h3>
            {mentor ? (
              <div className="sc-head">
                <Avatar name={mentor.name} size={56} />
                <div style={{ flex: 1 }}>
                  <b>{mentor.name}</b>
                  <p className="sc-mini">{mentor.subject ?? "—"} · {mentor.className ?? "—"} · ID {mentor.teacherId ?? "—"}</p>
                </div>
                <button className="btn" type="button" onClick={() => setViewUid(mentor.uid)}>View profile</button>
              </div>
            ) : <Empty>No mentor assigned to your class yet.</Empty>}
          </div>
          <div className="card">
            <h3>🏆 Class leaderboard</h3>
            <ol className="lb">
              {classmates.slice(0, 10).map((s, i) => (
                <li key={s.uid} className={s.uid === me.uid ? "me" : ""}>
                  <span className="rk">#{i + 1}</span><span className="nm">{s.name}</span><b>{s.airScore}</b>
                </li>
              ))}
              {classmates.length === 0 && <li className="muted">No classmates yet.</li>}
            </ol>
          </div>
          <div className="card">
            <h3>📅 Upcoming events</h3>
            <ul className="plain">
              {events.filter((e) => (e.className === "ALL" || e.className === me.className) && e.date >= todayISO())
                .slice(0, 8).map((e) => <li key={e.id}>{e.date} — <b>{e.title}</b>{e.note ? ` · ${e.note}` : ""}</li>)}
              {events.filter((e) => (e.className === "ALL" || e.className === me.className) && e.date >= todayISO()).length === 0 && <li className="muted">Nothing upcoming.</li>}
            </ul>
          </div>
          <div className="card">
            <h3>📌 Notice board</h3>
            <ul className="plain">
              {notices.filter((n) => ["all", "students", me.className].includes(n.audience)).slice(0, 10)
                .map((n) => <li key={n.id}><b>{n.title}</b> — {n.body} <span className="muted">({n.by})</span></li>)}
              {notices.filter((n) => ["all", "students", me.className].includes(n.audience)).length === 0 && <li className="muted">No notices.</li>}
            </ul>
          </div>
        </>
      )}

      {tab === "calendar" && <Calendar topics={topics} events={events.filter((e) => e.className === "ALL" || e.className === me.className)} />}

      {tab === "syllabus" && (
        <>
          {Object.entries(topics.reduce<Record<string, Topic[]>>((m, t) => { (m[t.subject ?? "General"] ??= []).push(t); return m; }, {}))
            .map(([subject, rows]) => {
              const done = rows.filter((t) => t.doneTeacher || t.doneAI).length;
              return (
                <div className="card" key={subject}>
                  <h3>{subject} <span className="sc-mini">· {Math.round((done / rows.length) * 100)}% complete</span></h3>
                  <Bar pct={(done / rows.length) * 100} />
                  <ul className="plain">
                    {rows.slice().sort((a, b) => a.date.localeCompare(b.date)).map((t) => {
                      const rev = (t as Topic & { revised?: string[] }).revised ?? [];
                      const mine = rev.includes(me.uid);
                      return (
                        <li key={t.id} className="sc-kv" style={{ border: 0 }}>
                          <span>{t.date} — {t.topic} {t.doneAI && <span className="sc-badge priv">🤖 AI verified</span>}{t.doneTeacher && <span className="sc-badge gov">Taught</span>}</span>
                          <button className={`sc-chip${mine ? " on" : ""}`} type="button" onClick={() => {
                            void update("syllabus", t.id, { revised: mine ? arrayRemove(me.uid) : arrayUnion(me.uid) });
                            notify(mine ? "Revised mark removed" : "Marked as revised ✓");
                          }}>🔁 Revised {rev.length > 0 ? `(${rev.length})` : ""}</button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              );
            })}
          {topics.length === 0 && <Empty>No syllabus yet.</Empty>}
        </>
      )}

      {tab === "work" && (
        <div className="card">
          <h3>📝 Homework & assignments</h3>
          <ul className="plain">
            {[...assigns].sort((a, b) => b.createdAt - a.createdAt).map((a) => (
              <li key={a.id} className="sc-kv" style={{ border: 0 }}>
                <span><b>{a.title}</b> <span className="muted">· {a.subject ?? "General"} · by {a.by ?? "Teacher"}</span></span>
                <span className={`badge ${a.due && a.due < todayStr() ? "orange" : "green"}`}>{a.due ? (a.due < todayStr() ? "Overdue" : `Due ${a.due}`) : "No due date"}</span>
              </li>
            ))}
            {assigns.length === 0 && <li className="muted">Nothing to do — enjoy! 🎉</li>}
          </ul>
        </div>
      )}

      {tab === "notes" && (
        <NotesTab me={me} notify={notify} notes={notes} boardNotes={boardNotes} />
      )}

      {tab === "doubts" && (
        <DoubtsTab me={me} notify={notify} users={users} myDoubts={myDoubts} mentor={mentor} />
      )}
    </>
  );
}

function Calendar({ topics, events }: { topics: Topic[]; events: EventDoc[] }): JSX.Element {
  const [ym, setYm] = useState(() => new Date());
  const [sel, setSel] = useState(todayISO());
  const y = ym.getFullYear(); const m = ym.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();
  const count = (iso: string): number =>
    topics.filter((t) => t.date === iso).length + events.filter((e) => e.date === iso).length;
  return (
    <div className="grid2">
      <div className="card">
        <div className="cal-head">
          <button className="btn" type="button" onClick={() => setYm(new Date(y, m - 1, 1))}>‹</button>
          <h3 style={{ margin: 0 }}>{ym.toLocaleString("en", { month: "long" })} {y}</h3>
          <button className="btn" type="button" onClick={() => setYm(new Date(y, m + 1, 1))}>›</button>
        </div>
        <div className="cal">
          {["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => <span className="dow" key={d}>{d}</span>)}
          {Array.from({ length: first }, (_, i) => <span key={`e${i}`} />)}
          {Array.from({ length: days }, (_, i) => {
            const iso = `${y}-${String(m + 1).padStart(2, "0")}-${String(i + 1).padStart(2, "0")}`;
            const n = count(iso);
            return (
              <button key={iso} type="button" className={`cal-day${iso === sel ? " sel" : ""}`} onClick={() => setSel(iso)}>
                {i + 1}{n > 0 && <i className="dot">{n}</i>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="card">
        <h3>🗓 {sel}</h3>
        <ul className="plain">
          {topics.filter((t) => t.date === sel).map((t) => <li key={t.id}>📚 {t.subject} — {t.topic}</li>)}
          {events.filter((e) => e.date === sel).map((e) => <li key={e.id}>🎉 {e.title}{e.note ? ` · ${e.note}` : ""}</li>)}
          {count(sel) === 0 && <li className="muted">Nothing scheduled.</li>}
        </ul>
      </div>
    </div>
  );
}

function NotesTab({ me, notify, notes, boardNotes }: {
  me: User; notify: Notify; notes: NoteDoc[]; boardNotes: BC[];
}): JSX.Element {
  const [subject, setSubject] = useState("");
  const [rough, setRough] = useState("");
  const gen = async (): Promise<void> => {
    if (!rough.trim()) { notify("Paste your rough notes first", "error"); return; }
    const st = structureNotes(rough, "Class Notes");
    await saveNote(me, me.className ?? "—", subject, st.title, st.sections, "ai-structured");
    setRough(""); setSubject("");
    notify("Structured note saved 🧠");
  };
  const fromBoard = async (): Promise<void> => {
    const b = boardNotes[0];
    if (!b) { notify("No board captures for your class yet (hardware bridge writes them)", "error"); return; }
    const st = structureNotes(b.ocrText ?? "", "Board Notes");
    await saveNote(me, me.className ?? "—", subject || "General", st.title, st.sections, "board-capture");
    notify("Board capture converted to structured notes 📋");
  };
  return (
    <>
      <div className="card">
        <h3>🧠 Rough notes → structured personal notes</h3>
        <p className="sc-mini">Paste your broken bench-written notes (or anything). The structuring engine turns them into clean sections & bullet points — and “Import board” pulls the exact class board captured by the classroom hardware.</p>
        <div className="sc-form">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (e.g., Physics)" />
          <textarea rows={5} value={rough} onChange={(e) => setRough(e.target.value)}
            placeholder={"Newton's second law:\nForce equals mass times acceleration\nF = ma\n- vector quantity\n- SI unit newton"} />
          <div className="sc-actions">
            <button className="btn primary" type="button" onClick={() => void gen()}>✨ Structure & save</button>
            <button className="btn" type="button" onClick={() => void fromBoard()}>📋 Import latest board capture ({boardNotes.length})</button>
          </div>
        </div>
      </div>
      {notes.map((n) => (
        <div className="card sc-note" key={n.id}>
          <div className="phead">
            <b>{n.title}</b><span className="sc-badge kind">{n.source === "board-capture" ? "📋 Board" : "🧠 Structured"}</span>
            <span className="sc-mini">{n.subject} · {n.by} · {new Date(n.at).toLocaleDateString()}</span>
            {n.byUid === me.uid && (
              <button className="btn like" type="button" onClick={async () => {
                await deleteDoc(doc(db, "notes", n.id)); notify("Note deleted");
              }}>🗑</button>
            )}
          </div>
          {n.sections.map((s, i) => (
            <div key={i}>
              <h4>{s.h}</h4>
              <ul>{s.points.map((p, j) => <li key={j}>{p}</li>)}</ul>
            </div>
          ))}
        </div>
      ))}
      {notes.length === 0 && <Empty>No notes yet — create your first one above.</Empty>}
    </>
  );
}

function DoubtsTab({ me, notify, users, myDoubts, mentor }: {
  me: User; notify: Notify; users: User[]; myDoubts: DoubtRow[]; mentor: User | null;
}): JSX.Element {
  const teachers = users.filter((u) => u.role === "teacher");
  const [subject, setSubject] = useState("");
  const [q, setQ] = useState("");
  const [vis, setVis] = useState<"public" | "private">("public");
  const [toT, setToT] = useState(mentor?.uid ?? teachers[0]?.uid ?? "");
  const post = async (): Promise<void> => {
    if (!subject.trim() || !q.trim()) { notify("Fill subject and question", "error"); return; }
    const t = teachers.find((x) => x.uid === toT);
    await add("doubts", {
      studentUid: me.uid, studentName: me.name, subject: subject.trim(), question: q.trim(),
      status: "open", visibility: vis,
      toTeacherUid: vis === "private" ? (t?.uid ?? null) : null,
      toTeacherName: vis === "private" ? (t?.name ?? null) : null,
      createdAt: Date.now(),
    });
    setSubject(""); setQ("");
    notify(vis === "private" ? `Private doubt sent to ${t?.name ?? "teacher"} 🔒` : "Public doubt posted ❓");
  };
  return (
    <>
      <div className="card">
        <h3>❓ Ask a doubt</h3>
        <div className="sc-form">
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject" />
          <textarea rows={3} value={q} onChange={(e) => setQ(e.target.value)} placeholder="What is your doubt?" />
          <div className="sc-grid">
            <select value={vis} onChange={(e) => setVis(e.target.value as "public" | "private")}>
              <option value="public">🌍 Public — anyone can answer</option>
              <option value="private">🔒 Private — one teacher only</option>
            </select>
            {vis === "private" && (
              <select value={toT} onChange={(e) => setToT(e.target.value)}>
                {teachers.map((t) => <option key={t.uid} value={t.uid}>{t.name}{t.uid === mentor?.uid ? " (your mentor)" : ""}</option>)}
              </select>
            )}
          </div>
          <button className="btn primary" type="button" onClick={() => void post()}>Post doubt</button>
        </div>
      </div>
      {myDoubts.map((d) => (
        <div className={`card doubt ${d.status}`} key={d.id}>
          <div className="phead">
            <b>{d.subject}</b>
            <span className={`badge ${d.status === "solved" ? "green" : "orange"}`}>{d.status}</span>
            {d.visibility === "private" && <span className="sc-badge role">🔒 to {d.toTeacherName ?? "teacher"}</span>}
          </div>
          <p><b>Q:</b> {d.question}</p>
          {d.status === "solved" && <p className="answer"><b>{d.answeredBy ?? "Teacher"}:</b> {d.answer}</p>}
        </div>
      ))}
      {myDoubts.length === 0 && <Empty>No doubts asked yet.</Empty>}
    </>
  );
}
