import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  add, arrayRemove, arrayUnion, bumpAir, get, list, update, watch,
  type Attendance, type Assignment, type Content, type Doubt, type Mark,
  type Post, type Project, type QuizDoc, type Rating, type Role,
  type Session, type Topic, type User,
} from "./firebase";
import { stars, timeAgo, todayStr } from "./ui";
import SchoolHub from "./teacher/SchoolHub";

/* ---------------- helpers ---------------- */
export const FALLBACK: QuizDoc[] = [
  { id: "d1", subject: "General", question: "What does CPU stand for?",
    options: ["Central Process Unit", "Central Processing Unit", "Computer Personal Unit", "Central Program Unit"], correctIndex: 1 },
  { id: "d2", subject: "General", question: "Which planet is known as the Red Planet?",
    options: ["Venus", "Mars", "Jupiter", "Mercury"], correctIndex: 1 },
  { id: "d3", subject: "Maths", question: "What is 12 × 8?",
    options: ["86", "96", "108", "92"], correctIndex: 1 },
];
let quizCache: QuizDoc[] | null = null;
export async function getQuizzes(): Promise<QuizDoc[]> {
  if (quizCache) return quizCache;
  const rows = await list<QuizDoc>("quizzes");
  quizCache = rows.length ? rows : FALLBACK;
  return quizCache;
}

export const medal = (i: number): string => ["🥇", "🥈", "🥉"][i] ?? `#${i + 1}`;

export function useWatch<T>(col: string, w?: [string, unknown]): T[] {
  const [rows, setRows] = useState<T[]>([]);
  const key = w ? `${w[0]}|${String(w[1])}` : "";
  useEffect(() => {
    const unsub = watch<T>(col, setRows, w);
    return () => { unsub(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [col, key]);
  return rows;
}

export type Notify = (msg: string, type?: "success" | "error") => void;
export interface ViewProps { me: User; notify: Notify; showQuiz: (q: QuizDoc, points: number) => void; }

export const NAV: Record<Role, Array<[string, string, string]>> = {
  student: [
    ["profile", "My Profile", "👤"],
    ["inclass", "In Class (3-Device)", "📶"],
    ["offclass", "Off Class", "📚"],
    ["social", "Student LinkedIn", "💬"],
    ["doubts", "Post Doubts", "❓"],
    ["projects", "Display Project", "🛠️"],
  ],
  teacher: [
    ["profile", "My Profile", "👤"],
    ["classroom", "Class Room (Hood)", "🏫"],
    ["social", "Teacher LinkedIn", "💬"],
    ["doubts", "Doubt Solve", "❓"],
    ["timetable", "Time Table", "🗓️"],
  ],
  hm: [["overview", "School Overview", "📊"], ["school", "School Hub", "🏫"]],
  meo: [["overview", "School Overview", "📊"], ["school", "School Hub", "🏫"]],
  deo: [["overview", "School Overview", "📊"], ["school", "School Hub", "🏫"]],
};

/* ================= PORTAL SHELL ================= */
export function Portal({ me, notify, onLogout }: { me: User; notify: Notify; onLogout: () => void }): JSX.Element {
  const items = NAV[me.role];
  const [view, setView] = useState(items[0][0]);
  const [quiz, setQuiz] = useState<{ q: QuizDoc; points: number } | null>(null);
  const showQuiz = useCallback((q: QuizDoc, points: number) => setQuiz({ q, points }), []);

  const views: Record<string, JSX.Element> = {
    profile: <ProfileView me={me} notify={notify} showQuiz={showQuiz} />,
    inclass: <InClassView me={me} notify={notify} showQuiz={showQuiz} />,
    offclass: <OffClassView me={me} notify={notify} showQuiz={showQuiz} />,
    social: <SocialView me={me} notify={notify} showQuiz={showQuiz} />,
    doubts: <DoubtsView me={me} notify={notify} showQuiz={showQuiz} />,
    projects: <ProjectsView me={me} notify={notify} showQuiz={showQuiz} />,
    classroom: <ClassroomView me={me} notify={notify} showQuiz={showQuiz} />,
    timetable: <TimetableView me={me} notify={notify} showQuiz={showQuiz} />,
    overview: <OverviewView me={me} notify={notify} showQuiz={showQuiz} />,
    school: <SchoolHub me={me} notify={notify} />,
  };
  const current = items.find((i) => i[0] === view) ?? items[0];

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">🌌 <span>The Pentagon Inc</span></div>
        <nav>
          {items.map(([k, label, icon]) => (
            <button key={k} type="button" className={`nav-btn${view === k ? " on" : ""}`} onClick={() => setView(k)}>
              <span>{icon}</span>{label}
            </button>
          ))}
        </nav>
        <button className="btn ghost block" type="button" onClick={onLogout}>Logout</button>
      </aside>
      <div className="main">
        <header className="topbar">
          <h2>{current[1]}</h2>
          <div className="chip-user">
            <span>{me.name}</span>
            <span className="badge">{me.role.toUpperCase()}</span>
          </div>
        </header>
        <main className="views">{views[view] ?? views.profile}</main>
      </div>
      {quiz && <QuizModal data={quiz} me={me} notify={notify} close={() => setQuiz(null)} />}
    </div>
  );
}

/* ================= QUIZ MODAL ================= */
export function QuizModal({ data, me, notify, close }: {
  data: { q: QuizDoc; points: number }; me: User; notify: Notify; close: () => void;
}): JSX.Element {
  const [sel, setSel] = useState(-1);
  const [done, setDone] = useState(false);

  const submit = async (): Promise<void> => {
    if (done) return;
    if (sel < 0) { notify("Select an answer first", "error"); return; }
    setDone(true);
    const ok = sel === data.q.correctIndex;
    const gained = ok ? data.points : 1;
    try {
      await bumpAir(me.uid, gained);
      await add("marks", {
        studentUid: me.uid, exam: "Quiz", subject: data.q.subject,
        score: ok ? 1 : 0, total: 1, createdAt: Date.now(),
      });
    } catch (err) { console.error(err); }
    notify(ok ? `✅ Correct! +${gained}` : "❌ Wrong — +1 for trying", ok ? "success" : "error");
    close();
  };

  return (
    <div className="modal">
      <div className="modal-box">
        <div className="modal-head">
          <h3>🧪 Quiz</h3>
          <button className="x" type="button" onClick={close}>✕</button>
        </div>
        <p className="muted">+{data.points} Air Score for a correct answer</p>
        <h4>{data.q.question}</h4>
        <div className="opts">
          {data.q.options.map((o, i) => (
            <button key={i} type="button" className={`opt${sel === i ? " sel" : ""}`} onClick={() => setSel(i)}>{o}</button>
          ))}
        </div>
        <button className="btn primary block" type="button" onClick={() => void submit()}>Submit Answer</button>
      </div>
    </div>
  );
}

/* ================= 1 · PROFILE ================= */
function ProfileView({ me }: ViewProps): JSX.Element {
  const users = useWatch<User>("users");
  const ratings = useWatch<Rating>("ratings");
  const students = useMemo(
    () => users.filter((u) => u.role === "student").sort((a, b) => b.airScore - a.airScore), [users]);
  const rank = students.findIndex((s) => s.uid === me.uid) + 1;
  const mine = useMemo(
    () => ratings.filter((r) => r.teacherUid === me.uid).sort((a, b) => b.createdAt - a.createdAt),
    [ratings, me.uid]);
  const avg = mine.length ? mine.reduce((s, r) => s + r.stars, 0) / mine.length : 0;

  return (
    <>
      <div className="grid2">
        <div className="card">
          <h3>👤 My Profile</h3>
          <div className="prow"><span>Name</span><b>{me.name}</b></div>
          <div className="prow"><span>Email</span><b>{me.email}</b></div>
          <div className="prow"><span>Role</span><b>{me.role.toUpperCase()}</b></div>
          {me.role === "student" && (
            <>
              <div className="prow"><span>Student ID</span><b>{me.studentId ?? "—"}</b></div>
              <div className="prow"><span>Class</span><b>{me.className ?? "—"}</b></div>
              <div className="prow"><span>⚡ Air Score</span><b>{me.airScore}</b></div>
              <div className="prow"><span>Rank</span><b>{rank > 0 ? `#${rank}` : "—"}</b></div>
            </>
          )}
          {me.role === "teacher" && (
            <>
              <div className="prow"><span>Teacher ID</span><b>{me.teacherId ?? "—"}</b></div>
              <div className="prow"><span>Subject</span><b>{me.subject ?? "—"}</b></div>
              <div className="prow"><span>Class</span><b>{me.className ?? "—"}</b></div>
            </>
          )}
        </div>
        <div className="card">
          <h3>🏆 Air Score Leaderboard</h3>
          <ol className="lb">
            {students.slice(0, 10).map((s, i) => (
              <li key={s.uid} className={s.uid === me.uid ? "me" : ""}>
                <span className="rk">{medal(i)}</span><span className="nm">{s.name}</span><b>{s.airScore}</b>
              </li>
            ))}
            {students.length === 0 && <li className="muted">No students yet.</li>}
          </ol>
        </div>
      </div>
      {me.role === "teacher" && (
        <div className="card">
          <h3>⭐ Teacher Performance</h3>
          <div className="rate">
            <div className="big">{mine.length ? avg.toFixed(1) : "—"}<small>/5</small></div>
            <div>{stars(avg)}<br /><span className="muted">{mine.length} rating(s)</span></div>
          </div>
          <h4>Comments</h4>
          <ul className="comments">
            {mine.slice(0, 5).map((r) => (
              <li key={r.id}><b>{r.studentName}</b> {stars(r.stars)}<p>{r.comment}</p></li>
            ))}
            {mine.length === 0 && <li className="muted">No comments yet.</li>}
          </ul>
        </div>
      )}
    </>
  );
}

/* ================= 2 · IN CLASS (3-device) ================= */
export function InClassView({ me, notify, showQuiz }: ViewProps): JSX.Element {
  const sessions = useWatch<Session>("sessions", ["active", true]);
  const session = useMemo(
    () => sessions.filter((s) => s.className === me.className).sort((a, b) => b.startedAt - a.startedAt)[0] ?? null,
    [sessions, me.className]);
  const sid = session?.id ?? "";
  const contents = useWatch<Content>("contents", sid ? ["sessionId", sid] : undefined);
  const items = useMemo(
    () => contents.filter((c) => c.sessionId === sid).sort((a, b) => b.createdAt - a.createdAt),
    [contents, sid]);
  const [connected, setConnected] = useState(false);
  const [picked, setPicked] = useState(0);
  const [note, setNote] = useState("");

  const connect = async (): Promise<void> => {
    if (connected) { setConnected(false); return; }
    const rows = await list<Attendance>("attendance", ["date", todayStr()]);
    if (!rows.some((a) => a.uid === me.uid && a.method === "tab-hardware")) {
      await add("attendance", {
        date: todayStr(), uid: me.uid, name: me.name, role: me.role,
        method: "tab-hardware", createdAt: Date.now(),
      });
      notify("Attendance marked ✅");
    }
    setConnected(true);
  };

  const rate = async (): Promise<void> => {
    if (!session) { notify("No live class", "error"); return; }
    if (picked === 0) { notify("Pick a star rating", "error"); return; }
    await add("ratings", {
      teacherUid: session.teacherUid, teacherName: session.teacherName,
      studentName: me.name, stars: picked, comment: note.trim(), createdAt: Date.now(),
    });
    setPicked(0); setNote("");
    notify("Thanks for rating! ⭐");
  };

  return (
    <>
      <p className="hint">3-Device System — <b className="c1">Tab</b> ⇄ <b className="c2">Hardware</b> ⇄ <b className="c3">Teacher's Hood</b>. Same class name required.</p>
      <div className="grid3">
        <div className="card dev t1">
          <h3>📱 Tab</h3>
          {!session ? <p className="muted">No live class for your class right now.</p> : (
            <>
              <p className={`conn ${connected ? "on" : "off"}`}>{connected ? "🟢 Connected" : "🔴 Not connected"}</p>
              <button className="btn primary" type="button" onClick={() => void connect()}>
                {connected ? "Disconnect" : "🔗 Connect to Hardware"}
              </button>
              <div className="stream">
                {items.map((it) => {
                  if (it.type === "test" && it.quiz) {
                    const q = it.quiz;
                    return (
                      <div className="item test" key={it.id}>
                        <b>🧪 Class Test</b><p>{it.text}</p>
                        <button className="btn primary" type="button" onClick={() => showQuiz({ id: it.id, ...q }, 10)}>Open Test</button>
                      </div>
                    );
                  }
                  if (it.type === "video") {
                    return (
                      <div className="item" key={it.id}>
                        <b>🎬 Video</b><br /><a href={it.text} target="_blank" rel="noopener noreferrer">{it.text}</a>
                      </div>
                    );
                  }
                  return <div className="item" key={it.id}><b>📒 Note</b><p>{it.text}</p></div>;
                })}
                {items.length === 0 && <p className="muted">No content pushed yet.</p>}
              </div>
            </>
          )}
        </div>
        <div className="card dev t2">
          <h3>🖥️ Hardware</h3>
          {session ? (
            <>
              <div className="prow"><span>Teacher</span><b>{session.teacherName}</b></div>
              <div className="prow"><span>Subject</span><b>{session.subject}</b></div>
              <div className="prow"><span>Started</span><b>{timeAgo(session.startedAt)}</b></div>
              <div className="prow"><span>Attendance</span><b>{connected ? "✅ Present" : "⏳ Pending"}</b></div>
              <button className="btn" type="button"
                onClick={() => { void getQuizzes().then((qs) => showQuiz(qs[Math.floor(Math.random() * qs.length)], 5)); }}>
                Simulate: not listening → quiz
              </button>
            </>
          ) : <p className="muted">Hardware idle.</p>}
        </div>
        <div className="card dev t3">
          <h3>🎓 Hood</h3>
          {session ? (
            <>
              <p className="conn on">🟢 Session LIVE</p>
              <div className="prow"><span>Teacher attendance</span><b>✅ Hood login</b></div>
            </>
          ) : <p className="conn off">🔴 Teacher not in Hood</p>}
        </div>
      </div>
      {session && (
        <div className="card">
          <h3>⭐ Rate today's teacher</h3>
          <div className="star-row">
            {[1, 2, 3, 4, 5].map((v) => (
              <button key={v} type="button" className={`star${picked >= v ? " on" : ""}`} onClick={() => setPicked(v)}>★</button>
            ))}
          </div>
          <textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Comment (optional)" />
          <button className="btn primary" type="button" onClick={() => void rate()}>Submit Rating</button>
        </div>
      )}
    </>
  );
}

/* ================= 3 · OFF CLASS ================= */
function OffClassView({ me, showQuiz }: ViewProps): JSX.Element {
  const [tab, setTab] = useState<"hw" | "marks" | "quiz">("hw");
  const [hw, setHw] = useState<Assignment[]>([]);
  const [marks, setMarks] = useState<Mark[]>([]);
  const [qs, setQs] = useState<QuizDoc[]>([]);

  useEffect(() => {
    if (tab === "hw") void list<Assignment>("assignments").then((r) => setHw([...r].sort((a, b) => b.createdAt - a.createdAt)));
    if (tab === "marks") void list<Mark>("marks", ["studentUid", me.uid]).then((r) => setMarks([...r].sort((a, b) => b.createdAt - a.createdAt)));
    if (tab === "quiz") void getQuizzes().then(setQs);
  }, [tab, me.uid]);

  return (
    <>
      <div className="tabs">
        {([["hw", "📘 Homework"], ["marks", "📊 Marks"], ["quiz", "🧠 Quiz"]] as const).map(([k, label]) => (
          <button key={k} type="button" className={`tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === "hw" && (hw.length ? hw.map((a) => (
        <div className="card" key={a.id}>
          <h3>📘 {a.title}</h3>
          <p className="muted">Subject: {a.subject ?? "—"} · Due: {a.due ?? "—"} · by {a.by ?? "Teacher"}</p>
        </div>
      )) : <p className="muted">No homework yet.</p>)}
      {tab === "marks" && (marks.length ? (
        <div className="card">
          <table>
            <thead><tr><th>Exam</th><th>Subject</th><th>Score</th><th>Date</th></tr></thead>
            <tbody>
              {marks.map((m) => (
                <tr key={m.id}>
                  <td>{m.exam}</td><td>{m.subject}</td><td>{m.score}/{m.total}</td>
                  <td>{new Date(m.createdAt).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : <p className="muted">No marks yet — take quizzes to build your record.</p>)}
      {tab === "quiz" && qs.map((q) => (
        <div className="card" key={q.id}>
          <h3>{q.question}</h3>
          <p className="muted">{q.subject}</p>
          <button className="btn primary" type="button" onClick={() => showQuiz(q, 5)}>Attempt</button>
        </div>
      ))}
    </>
  );
}

/* ================= 4 · SOCIAL (shared feed) ================= */
export function SocialView({ me, notify }: ViewProps): JSX.Element {
  const posts = useWatch<Post>("feed");
  const sorted = useMemo(() => [...posts].sort((a, b) => b.createdAt - a.createdAt), [posts]);
  const [text, setText] = useState("");

  const post = async (): Promise<void> => {
    if (!text.trim()) { notify("Write something first", "error"); return; }
    await add("feed", { authorUid: me.uid, authorName: me.name, role: me.role, content: text.trim(), likes: [], createdAt: Date.now() });
    setText("");
    notify("Posted 🚀");
  };

  const like = async (id: string): Promise<void> => {
    const p = await get<Post>("feed", id);
    if (!p) return;
    const has = (p.likes ?? []).includes(me.uid);
    await update("feed", id, { likes: has ? arrayRemove(me.uid) : arrayUnion(me.uid) });
  };

  return (
    <>
      <div className="card">
        <h3>💼 {me.role === "teacher" ? "Teacher" : "Student"} LinkedIn</h3>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)} placeholder="Share something with your network…" />
        <button className="btn primary" type="button" onClick={() => void post()}>Post</button>
      </div>
      {sorted.map((p) => {
        const likes = p.likes ?? [];
        return (
          <div className="card" key={p.id}>
            <div className="phead">
              <b>{p.authorName}</b><span className="badge">{p.role}</span>
              <span className="muted">{timeAgo(p.createdAt)}</span>
            </div>
            <p>{p.content}</p>
            <button className="btn like" type="button" onClick={() => void like(p.id)}>
              {likes.includes(me.uid) ? "❤️" : "🤍"} {likes.length}
            </button>
          </div>
        );
      })}
      {sorted.length === 0 && <p className="muted">No posts yet — be first!</p>}
    </>
  );
}

/* ================= 5 · DOUBTS ================= */
export function DoubtsView({ me, notify }: ViewProps): JSX.Element {
  const isStudent = me.role === "student";
  const all = useWatch<Doubt>("doubts");
  const docs = useMemo(
    () => [...all].sort((a, b) => b.createdAt - a.createdAt).filter((d) => !isStudent || d.studentUid === me.uid),
    [all, isStudent, me.uid]);
  const [subject, setSubject] = useState("");
  const [question, setQuestion] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const prev = useRef<Map<string, boolean>>(new Map());
  const first = useRef(true);

  useEffect(() => {
    if (first.current) first.current = false;
    else if (isStudent) {
      docs.forEach((d) => {
        if (prev.current.get(d.id) === true && d.status === "solved") {
          notify(`🎉 ${d.answeredBy ?? "A teacher"} solved your ${d.subject} doubt!`);
        }
      });
    }
    prev.current = new Map(docs.map((d) => [d.id, d.status !== "solved"]));
  }, [docs, isStudent, notify]);

  const post = async (): Promise<void> => {
    if (!subject.trim() || !question.trim()) { notify("Fill subject and question", "error"); return; }
    await add("doubts", {
      studentUid: me.uid, studentName: me.name, subject: subject.trim(),
      question: question.trim(), status: "open", createdAt: Date.now(),
    });
    setSubject(""); setQuestion("");
    notify("Doubt posted ✅");
  };

  const sendAnswer = async (id: string): Promise<void> => {
    const answer = (answers[id] ?? "").trim();
    if (!answer) { notify("Write an answer", "error"); return; }
    await update("doubts", id, { status: "solved", answer, answeredBy: me.name });
    notify("Answer sent ✅");
  };

  return (
    <>
      {isStudent && (
        <div className="card">
          <h3>❓ Post a Doubt</h3>
          <input value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject (e.g., Mathematics)" />
          <textarea rows={3} value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="What is your doubt?" />
          <button className="btn primary" type="button" onClick={() => void post()}>Post Doubt</button>
        </div>
      )}
      <h3>{isStudent ? "My Doubts" : "❓ Doubt Solve — questions from students"}</h3>
      {docs.map((d) => (
        <div className={`card doubt ${d.status}`} key={d.id}>
          <div className="phead">
            <b>{d.studentName}</b><span className="badge">{d.subject}</span>
            <span className={`badge ${d.status === "solved" ? "green" : "orange"}`}>{d.status}</span>
            <span className="muted">{timeAgo(d.createdAt)}</span>
          </div>
          <p><b>Q:</b> {d.question}</p>
          {d.status === "solved" ? (
            <p className="answer"><b>✅ {d.answeredBy ?? "Teacher"}:</b> {d.answer}</p>
          ) : isStudent ? (
            <p className="muted">Waiting for a teacher…</p>
          ) : (
            <>
              <textarea rows={2} placeholder="Write your answer…"
                value={answers[d.id] ?? ""}
                onChange={(e) => setAnswers((p) => ({ ...p, [d.id]: e.target.value }))} />
              <button className="btn primary" type="button" onClick={() => void sendAnswer(d.id)}>Send Answer</button>
            </>
          )}
        </div>
      ))}
      {docs.length === 0 && <p className="muted">No doubts yet.</p>}
    </>
  );
}

/* ================= 6 · PROJECTS ================= */
function ProjectsView({ me, notify }: ViewProps): JSX.Element {
  const projects = useWatch<Project>("projects");
  const sorted = useMemo(() => [...projects].sort((a, b) => b.createdAt - a.createdAt), [projects]);
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [link, setLink] = useState("");

  const publish = async (): Promise<void> => {
    if (!title.trim()) { notify("Title required", "error"); return; }
    await add("projects", {
      studentUid: me.uid, studentName: me.name, title: title.trim(),
      description: desc.trim(), link: link.trim(), likes: [], createdAt: Date.now(),
    });
    setTitle(""); setDesc(""); setLink("");
    notify("Project published 🎉");
  };

  const like = async (id: string): Promise<void> => {
    const p = await get<Project>("projects", id);
    if (!p) return;
    const has = (p.likes ?? []).includes(me.uid);
    await update("projects", id, { likes: has ? arrayRemove(me.uid) : arrayUnion(me.uid) });
  };

  return (
    <>
      <div className="card">
        <h3>🛠️ Display Project</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title" />
        <textarea rows={2} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Describe your project…" />
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Link (optional — GitHub, video…)" />
        <button className="btn primary" type="button" onClick={() => void publish()}>Publish</button>
      </div>
      <div className="grid2">
        {sorted.map((p) => {
          const likes = p.likes ?? [];
          return (
            <div className="card" key={p.id}>
              <h3>{p.title}</h3>
              <p>{p.description}</p>
              {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer">🔗 Open link</a>}
              <div className="phead">
                <small className="muted">by <b>{p.studentName}</b> · {timeAgo(p.createdAt)}</small>
                <button className="btn like" type="button" onClick={() => void like(p.id)}>
                  {likes.includes(me.uid) ? "❤️" : "🤍"} {likes.length}
                </button>
              </div>
            </div>
          );
        })}
        {sorted.length === 0 && <p className="muted">No projects yet.</p>}
      </div>
    </>
  );
}

/* ================= 7 · CLASSROOM (Teacher's Hood) ================= */
function ClassroomView({ me, notify }: ViewProps): JSX.Element {
  const sessions = useWatch<Session>("sessions", ["active", true]);
  const quizRows = useWatch<QuizDoc>("quizzes");
  const mine = useMemo(() => sessions.find((s) => s.teacherUid === me.uid) ?? null, [sessions, me.uid]);
  const tests = quizRows.length ? quizRows : FALLBACK;
  const [subject, setSubject] = useState(me.subject ?? "");
  const [cls, setCls] = useState(me.className ?? "");
  const [pushType, setPushType] = useState<"note" | "video">("note");
  const [pushText, setPushText] = useState("");
  const [hwTitle, setHwTitle] = useState("");
  const [hwDue, setHwDue] = useState("");
  const [hwKind, setHwKind] = useState<"homework" | "assignment">("homework");

  const start = async (): Promise<void> => {
    const sub = subject.trim() || me.subject || "General";
    const room = cls.trim() || me.className || "Class 10-A";
    await add("sessions", {
      teacherUid: me.uid, teacherName: me.name, subject: sub, className: room,
      startedAt: Date.now(), active: true,
    });
    const rows = await list<Attendance>("attendance", ["date", todayStr()]);
    if (!rows.some((a) => a.uid === me.uid)) {
      await add("attendance", {
        date: todayStr(), uid: me.uid, name: me.name, role: "teacher",
        method: "hood-login", createdAt: Date.now(),
      });
    }
    notify("Class started ✅");
  };

  const push = async (): Promise<void> => {
    if (!mine) return;
    if (!pushText.trim()) { notify("Write something", "error"); return; }
    await add("contents", { sessionId: mine.id, type: pushType, text: pushText.trim(), createdAt: Date.now() });
    setPushText("");
    notify("Pushed to Tabs 📱");
  };

  const postHw = async (): Promise<void> => {
    if (!hwTitle.trim()) { notify("Title required", "error"); return; }
    await add("assignments", {
      title: hwTitle.trim(), due: hwDue, subject: mine?.subject ?? me.subject ?? "General",
      by: me.name, kind: hwKind, createdAt: Date.now(),
    });
    setHwTitle("");
    notify(hwKind === "assignment" ? "Assignment posted 📝" : "Homework posted 📘");
  };

  const sendTest = async (q: QuizDoc): Promise<void> => {
    if (!mine) return;
    await add("contents", {
      sessionId: mine.id, type: "test", text: q.question,
      quiz: { question: q.question, options: q.options, correctIndex: q.correctIndex, subject: q.subject },
      createdAt: Date.now(),
    });
    notify("Test sent to Tabs 🧪");
  };

  const end = async (): Promise<void> => {
    if (!mine) return;
    await update("sessions", mine.id, { active: false });
    notify("Class ended 👏");
  };

  if (!mine) {
    return (
      <div className="card">
        <h3>🎓 Teacher's Hood — Start a class</h3>
        <p className="hint">Starting marks your attendance, notifies students and interlinks their Tabs.</p>
        <label>Subject <input value={subject} onChange={(e) => setSubject(e.target.value)} /></label>
        <label>Class <input value={cls} onChange={(e) => setCls(e.target.value)} /></label>
        <button className="btn primary" type="button" onClick={() => void start()}>🟢 Start Class</button>
      </div>
    );
  }

  return (
    <>
      <div className="live">🔴 LIVE — {mine.subject} · {mine.className} · started {timeAgo(mine.startedAt)}</div>
      <div className="grid2">
        <div className="card">
          <h3>📤 Push to student Tabs</h3>
          <select value={pushType} onChange={(e) => setPushType(e.target.value as "note" | "video")}>
            <option value="note">📒 Note</option>
            <option value="video">🎬 Video link</option>
          </select>
          <textarea rows={2} value={pushText} onChange={(e) => setPushText(e.target.value)} placeholder="Note text or video URL" />
          <button className="btn primary" type="button" onClick={() => void push()}>Push</button>
          <hr />
          <h3>📘 Post homework / assignment</h3>
          <select value={hwKind} onChange={(e) => setHwKind(e.target.value as "homework" | "assignment")}>
            <option value="homework">📘 Homework</option>
            <option value="assignment">📝 Assignment</option>
          </select>
          <input value={hwTitle} onChange={(e) => setHwTitle(e.target.value)} placeholder="Title" />
          <input type="date" value={hwDue} onChange={(e) => setHwDue(e.target.value)} />
          <button className="btn" type="button" onClick={() => void postHw()}>Post</button>
        </div>
        <div className="card">
          <h3>🧪 Send a class test</h3>
          {tests.map((q) => (
            <div className="qrow" key={q.id}>
              <span>{q.question}</span>
              <button className="btn" type="button" onClick={() => void sendTest(q)}>Send</button>
            </div>
          ))}
          <hr />
          <button className="btn danger block" type="button" onClick={() => void end()}>⏹ End class</button>
        </div>
      </div>
    </>
  );
}

/* ================= 8 · TIMETABLE ================= */
export function TimetableView({ me, notify }: ViewProps): JSX.Element {
  const topics = useWatch<Topic>("syllabus");
  const [ym, setYm] = useState(() => new Date());
  const [sel, setSel] = useState(todayStr());
  const [text, setText] = useState("");

  const byDate = useMemo(() => {
    const map: Record<string, Topic[]> = {};
    topics.forEach((t) => {
      if (!map[t.date]) map[t.date] = [];
      map[t.date].push(t);
    });
    return map;
  }, [topics]);

  const y = ym.getFullYear();
  const m = ym.getMonth();
  const first = new Date(y, m, 1).getDay();
  const days = new Date(y, m + 1, 0).getDate();

  const addTopic = async (): Promise<void> => {
    if (!text.trim()) return;
    await add("syllabus", {
      date: sel, subject: me.subject ?? "General", topic: text.trim(),
      doneTeacher: false, doneAI: false, createdAt: Date.now(),
    });
    setText("");
  };

  const aiCheck = async (): Promise<void> => {
    for (const t of byDate[sel] ?? []) {
      if (!t.doneAI) await update("syllabus", t.id, { doneAI: true });
    }
    notify("🤖 AI verified topics");
  };

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
            const n = (byDate[iso] ?? []).length;
            return (
              <button key={iso} type="button" className={`cal-day${iso === sel ? " sel" : ""}`} onClick={() => setSel(iso)}>
                {i + 1}{n > 0 && <i className="dot">{n}</i>}
              </button>
            );
          })}
        </div>
      </div>
      <div className="card">
        <h3>🗓️ Syllabus — {sel}</h3>
        {(byDate[sel] ?? []).map((t) => (
          <div className="trow" key={t.id}>
            <label>
              <input type="checkbox" checked={t.doneTeacher}
                onChange={(e) => void update("syllabus", t.id, { doneTeacher: e.target.checked }).then(() => notify("Syllabus updated ✅"))} />
              {t.topic}
            </label>
            {t.doneAI ? <span className="badge green">🤖 AI verified</span> : <span className="badge muted">AI pending</span>}
          </div>
        ))}
        {(byDate[sel] ?? []).length === 0 && <p className="muted">No topics for this date yet.</p>}
        <div className="addrow">
          <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Add topic for this date" />
          <button className="btn primary" type="button" onClick={() => void addTopic()}>Add</button>
          <button className="btn" type="button" onClick={() => void aiCheck()}>🤖 AI check</button>
        </div>
      </div>
    </div>
  );
}

/* ================= 9 · OVERVIEW (HM/MEO/DEO) ================= */
function OverviewView(_props: ViewProps): JSX.Element {
  const users = useWatch<User>("users");
  const doubts = useWatch<Doubt>("doubts");
  const att = useWatch<Attendance>("attendance", ["date", todayStr()]);
  const students = users.filter((u) => u.role === "student");
  const present = att.filter((a) => a.role === "student").length;
  const pct = students.length ? Math.round((present / students.length) * 100) : 0;
  const top = [...students].sort((a, b) => b.airScore - a.airScore).slice(0, 5);

  return (
    <>
      <div className="stats">
        <div className="card stat"><h3>{students.length}</h3><p className="muted">Students</p></div>
        <div className="card stat"><h3>{users.filter((u) => u.role === "teacher").length}</h3><p className="muted">Teachers</p></div>
        <div className="card stat"><h3>{pct}%</h3><p className="muted">Attendance today</p></div>
        <div className="card stat"><h3>{doubts.filter((d) => d.status === "open").length}</h3><p className="muted">Open doubts</p></div>
      </div>
      <div className="grid2">
        <div className="card">
          <h3>🏆 Top students</h3>
          <ol className="lb">
            {top.map((s, i) => (
              <li key={s.uid}><span className="rk">{medal(i)}</span><span className="nm">{s.name}</span><b>{s.airScore}</b></li>
            ))}
            {top.length === 0 && <li className="muted">No students yet.</li>}
          </ol>
        </div>
        <div className="card">
          <h3>📋 Today's attendance</h3>
          <ul className="plain">
            {att.map((a) => <li key={a.id}>{a.name} <span className="muted">({a.method})</span></li>)}
            {att.length === 0 && <li className="muted">None yet.</li>}
          </ul>
        </div>
      </div>
    </>
  );
}
