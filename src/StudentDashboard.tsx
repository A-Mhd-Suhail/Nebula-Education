import { useCallback, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  add, arrayRemove, arrayUnion, get, update,
  type Assignment, type Doubt, type Mark, type Post, type Project, type QuizDoc, type Session, type User,
} from "./firebase";
import { timeAgo, todayStr } from "./ui";
import { DoubtsView, InClassView, QuizModal, getQuizzes, medal, useWatch } from "./views";
import type { Notify } from "./views";
import TesseractMenu from "./Tesseract";
import { useSectionNav } from "./useSectionNav";
import type { TessNode } from "./Tesseract";
import "./student.css";
import ProfilePage from "./social/ProfilePage";
import SocialHub from "./social/SocialHub";
import MyClassroom from "./student/MyClassroom";
import StudyConnect from "./student/StudyConnect";
import "./social/social.css";

type View = "home" | "inclass" | "outclass" | "doubts" | "brain" | "projects" | "classroom" | "connect" | "id" | "social";
type SectionKey = Exclude<View, "home">;

/* ---------- icons ---------- */
const Ic = ({ children }: { children: ReactNode }): JSX.Element => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICONS: Record<SectionKey, JSX.Element> = {
  inclass: <Ic><rect x="3" y="4" width="18" height="12" rx="2" /><path d="M8 20h8M12 16v4" /><path d="m10.5 8 4 2-4 2z" /></Ic>,
  outclass: <Ic><path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" /><path d="M9.5 20v-5h5v5" /></Ic>,
  doubts: <Ic><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.01" /></Ic>,
  brain: <Ic><path d="M9 18h6M10 21h4" /><path d="M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0 0 12 3z" /></Ic>,
  projects: <Ic><path d="M12 3 4 7.5v9L12 21l8-4.5v-9z" /><path d="m4 7.5 8 4.5 8-4.5M12 12v9" /></Ic>,
  classroom: <Ic><path d="M3 21h18M5 21V9l7-5 7 5v12" /><path d="M10 21v-5h4v5" /></Ic>,
  connect: <Ic><circle cx="8" cy="9" r="3" /><circle cx="17" cy="15" r="3" /><path d="M4 20c0-3 2-5 4-5s4 2 4 5M10.5 10.5l3.5 3" /></Ic>,
  id: <Ic><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M14 10h4M14 14h3" /></Ic>,
  social: <Ic><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></Ic>,
};

const SECTIONS: Array<{ key: SectionKey; label: string; desc: string }> = [
  { key: "inclass", label: "In Class", desc: "Join the live class, receive notes and tests, and rate your teacher." },
  { key: "outclass", label: "Out Class", desc: "Homework, assignments, marks and practice quizzes." },
  { key: "doubts", label: "Doubt", desc: "Ask your teachers anything and get answers here." },
  { key: "brain", label: "Brain-It", desc: "Share your thoughts and celebrate your achievements." },
  { key: "projects", label: "My Projects", desc: "Upload your projects and explore what others built." },
  { key: "classroom", label: "My Classroom", desc: "Mentor, leaderboard, calendar, syllabus, work, notes and doubts." },
  { key: "connect", label: "Study Connect", desc: "Live group study with video, chat and a focus guard." },
  { key: "id", label: "My Profile", desc: "Banner, photo, bio, goals, skills, streak and Air Score." },
  { key: "social", label: "Student Social", desc: "Posts, achievements, Sync, messages and co-learner matching." },
];

const Glyph = (): JSX.Element => (
  <svg className="sd-glyph" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" aria-hidden="true">
    <rect x="3" y="3" width="12" height="12" stroke="#2f9bff" />
    <rect x="9" y="9" width="12" height="12" stroke="#ff9a2e" />
    <path d="M3 3l6 6M15 3l6 6M3 15l6 6M15 15l6 6" stroke="#8fd6ff" />
  </svg>
);

/* =================== SHELL =================== */
export default function StudentPortal({ me, notify, onLogout }: { me: User; notify: Notify; onLogout: () => void }): JSX.Element {
  const [view, go] = useSectionNav<View>("home");
  const [quiz, setQuiz] = useState<{ q: QuizDoc; points: number } | null>(null);
  const showQuiz = useCallback((q: QuizDoc, points: number) => setQuiz({ q, points }), []);

  const section = SECTIONS.find((s) => s.key === view);
  const props = { me, notify, showQuiz };

  const body: Record<SectionKey, JSX.Element> = {
    inclass: <InClassView {...props} />,
    outclass: <OutClassView me={me} showQuiz={showQuiz} />,
    doubts: <DoubtsView {...props} />,
    brain: <BrainItView me={me} notify={notify} />,
    projects: <MyProjectsView me={me} notify={notify} />,
    classroom: <MyClassroom me={me} notify={notify} />,
    connect: <StudyConnect me={me} notify={notify} />,
    id: <ProfilePage me={me} notify={notify} uid={me.uid} />,
    social: <SocialHub me={me} notify={notify} />,
  };

  return (
    <div className="sd">
      <header className="sd-top">
        <div className={`sd-crumbs${section ? " in-sec" : ""}`}>
          {section && (
            <button type="button" className="sd-home" onClick={() => go("home")} aria-label="Back to Home">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" /><path d="M9.5 20v-5h5v5" />
              </svg>
              <span>Home</span>
            </button>
          )}
          <button type="button" className="sd-title" onClick={() => go("home")} aria-label="Go to dashboard">
            <Glyph /><span>Dashboard</span>
          </button>
          {section && <><span className="sd-sep">/</span><span className="sd-cur">{section.label}</span></>}
        </div>
        <div className="sd-user">
          <span className="sd-ava" aria-hidden="true">{me.name.trim().charAt(0).toUpperCase() || "S"}</span>
          <span className="sd-uname"><b>{me.name}</b><small>Student</small></span>
          <button type="button" className="sd-logout" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="sd-wrap">
        {view === "home" || !section ? (
          <Home me={me} go={go} />
        ) : (
          <div className="sd-section" key={view}>
            <nav className="sd-pills" aria-label="Menu">
              {SECTIONS.map((s) => (
                <button key={s.key} type="button" className={s.key === view ? "on" : ""} onClick={() => go(s.key)}>
                  {ICONS[s.key]}<span>{s.label}</span>
                </button>
              ))}
            </nav>
            <div className="sd-head">
              <h1>{section.label}</h1>
              <p>{section.desc}</p>
            </div>
            {body[section.key]}
          </div>
        )}
      </div>

      {quiz && <QuizModal data={quiz} me={me} notify={notify} close={() => setQuiz(null)} />}
    </div>
  );
}

/* =================== HOME: common info + tesseract =================== */
function Home({ me, go }: { me: User; go: (v: View) => void }): JSX.Element {
  const users = useWatch<User>("users");
  const sessions = useWatch<Session>("sessions", ["active", true]);
  const doubts = useWatch<Doubt>("doubts", ["studentUid", me.uid]);
  const assigns = useWatch<Assignment>("assignments");
  const projects = useWatch<Project>("projects", ["studentUid", me.uid]);

  const students = useMemo(
    () => users.filter((u) => u.role === "student").sort((a, b) => b.airScore - a.airScore), [users]);
  const rank = students.findIndex((s) => s.uid === me.uid) + 1;
  const air = users.find((u) => u.uid === me.uid)?.airScore ?? me.airScore ?? 0;
  const live = sessions.find((s) => s.className === me.className) ?? null;
  const open = doubts.filter((d) => d.status !== "solved").length;
  const hw = assigns.filter((a) => a.kind !== "assignment").length;
  const asg = assigns.filter((a) => a.kind === "assignment").length;

  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });

  const nodes: TessNode[] = [
    { key: "inclass", label: "In Class", icon: ICONS.inclass,
      sub: live ? `${live.subject} · ${live.teacherName}` : "Live class & attendance", badge: live ? "● LIVE" : undefined },
    { key: "outclass", label: "Out Class", icon: ICONS.outclass,
      sub: "Homework · Assignments", badge: hw + asg > 0 ? `${hw + asg} posted` : undefined },
    { key: "doubts", label: "Doubt", icon: ICONS.doubts,
      sub: "Ask your teachers", badge: open > 0 ? `${open} open` : undefined },
    { key: "brain", label: "Brain-It", icon: ICONS.brain, sub: "Thoughts & achievements" },
    { key: "projects", label: "My Projects", icon: ICONS.projects,
      sub: "Upload & showcase", badge: projects.length > 0 ? `${projects.length} yours` : undefined },
  ];

  const tiles: Array<[string, string, string]> = [
    ["Air Score", String(air), "⚡ points earned"],
    ["Class rank", rank > 0 ? `#${rank}` : "—", `of ${students.length || "—"} students`],
    ["Open doubts", String(open), open ? "waiting for a teacher" : "all clear"],
    ["Homework", String(hw), `${asg} assignment${asg === 1 ? "" : "s"}`],
    ["Projects", String(projects.length), "uploaded by you"],
  ];

  return (
    <>
      <section className="sd-welcome">
        <div>
          <p className="sd-eyebrow">{today}</p>
          <h1>{greet}, {me.name.trim().split(/\s+/)[0]}</h1>
          <p className="sd-meta">
            <span>{me.className ?? "Class —"}</span><i />
            <span>ID {me.studentId ?? "—"}</span>
          </p>
        </div>
        <button type="button" className={`sd-live${live ? " on" : ""}`} onClick={() => go("inclass")}>
          <span className="dot" />
          {live ? `Live now · ${live.subject} with ${live.teacherName}` : "No live class right now"}
        </button>
      </section>

      <section className="sd-tiles" aria-label="Your summary">
        {tiles.map(([label, value, hint]) => (
          <div className="sd-tile" key={label}>
            <span>{label}</span><b>{value}</b><small>{hint}</small>
          </div>
        ))}
      </section>

      <TesseractMenu nodes={nodes} onSelect={(k) => go(k as View)} />

      <section className="sd-board card">
        <h3>🏆 Air Score leaderboard</h3>
        <ol className="lb">
          {students.slice(0, 5).map((s, i) => (
            <li key={s.uid} className={s.uid === me.uid ? "me" : ""}>
              <span className="rk">{medal(i)}</span><span className="nm">{s.name}</span><b>{s.airScore}</b>
            </li>
          ))}
          {students.length === 0 && <li className="muted">No students yet.</li>}
        </ol>
      </section>
    </>
  );
}

/* =================== OUT CLASS: homework · assignments (+ marks, quiz) =================== */
function OutClassView({ me, showQuiz }: { me: User; showQuiz: (q: QuizDoc, points: number) => void }): JSX.Element {
  const [tab, setTab] = useState<"hw" | "asg" | "marks" | "quiz">("hw");
  const rows = useWatch<Assignment>("assignments");
  const marks = useWatch<Mark>("marks", ["studentUid", me.uid]);
  const [qs, setQs] = useState<QuizDoc[]>([]);

  useEffect(() => { if (tab === "quiz") void getQuizzes().then(setQs); }, [tab]);

  const sorted = useMemo(() => [...rows].sort((a, b) => b.createdAt - a.createdAt), [rows]);
  const hw = sorted.filter((a) => a.kind !== "assignment");
  const asg = sorted.filter((a) => a.kind === "assignment");
  const myMarks = useMemo(() => [...marks].sort((a, b) => b.createdAt - a.createdAt), [marks]);
  const today = todayStr();

  const tasks = (items: Assignment[], empty: string): JSX.Element => (
    items.length ? (
      <div className="sd-tasks">
        {items.map((a) => (
          <div className="card sd-task" key={a.id}>
            <div>
              <h3>{a.title}</h3>
              <p className="muted">{a.subject ?? "General"} · by {a.by ?? "Teacher"} · {timeAgo(a.createdAt)}</p>
            </div>
            {a.due
              ? <span className={`badge ${a.due < today ? "orange" : "green"}`}>{a.due < today ? "Overdue" : `Due ${a.due}`}</span>
              : <span className="badge muted">No due date</span>}
          </div>
        ))}
      </div>
    ) : <p className="muted">{empty}</p>
  );

  const tabs: Array<[typeof tab, string]> = [
    ["hw", `📘 Homework (${hw.length})`], ["asg", `📝 Assignments (${asg.length})`],
    ["marks", "📊 Marks"], ["quiz", "🧠 Quiz"],
  ];

  return (
    <>
      <div className="tabs">
        {tabs.map(([k, label]) => (
          <button key={k} type="button" className={`tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>
      {tab === "hw" && tasks(hw, "No homework yet. Enjoy the break! 🎉")}
      {tab === "asg" && tasks(asg, "No assignments yet.")}
      {tab === "marks" && (myMarks.length ? (
        <div className="card">
          <table>
            <thead><tr><th>Exam</th><th>Subject</th><th>Score</th><th>Date</th></tr></thead>
            <tbody>
              {myMarks.map((m) => (
                <tr key={m.id}><td>{m.exam}</td><td>{m.subject}</td><td>{m.score}/{m.total}</td>
                  <td>{new Date(m.createdAt).toLocaleDateString()}</td></tr>
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

/* =================== BRAIN-IT: thoughts · achievements =================== */
type Kind = "thought" | "achievement";
const KIND_LABEL: Record<Kind, string> = { thought: "💡 Thought", achievement: "🏆 Achievement" };

function BrainItView({ me, notify }: { me: User; notify: Notify }): JSX.Element {
  const posts = useWatch<Post>("feed");
  const [kind, setKind] = useState<Kind>("thought");
  const [filter, setFilter] = useState<"all" | Kind>("all");
  const [text, setText] = useState("");

  const sorted = useMemo(() => [...posts].sort((a, b) => b.createdAt - a.createdAt), [posts]);
  const shown = sorted.filter((p) => filter === "all" || (p.kind ?? "thought") === filter);

  const post = async (): Promise<void> => {
    if (!text.trim()) { notify("Write something first", "error"); return; }
    await add("feed", {
      authorUid: me.uid, authorName: me.name, role: me.role, kind,
      content: text.trim(), likes: [], createdAt: Date.now(),
    });
    setText("");
    notify(kind === "achievement" ? "Achievement shared 🏆" : "Thought posted 💡");
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
        <div className="sd-kinds" role="radiogroup" aria-label="Post type">
          {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
            <button key={k} type="button" role="radio" aria-checked={kind === k}
              className={`sd-kind${kind === k ? " on" : ""}`} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>
        <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)}
          placeholder={kind === "achievement" ? "What did you achieve? A rank, a prize, a skill you finally cracked…" : "What's on your mind? An idea, a question, something you learned…"} />
        <button className="btn primary" type="button" onClick={() => void post()}>Post to Brain-It</button>
      </div>

      <div className="tabs">
        {([["all", "All"], ["thought", "💡 Thoughts"], ["achievement", "🏆 Achievements"]] as const).map(([k, label]) => (
          <button key={k} type="button" className={`tab${filter === k ? " on" : ""}`} onClick={() => setFilter(k)}>{label}</button>
        ))}
      </div>

      {shown.map((p) => {
        const likes = p.likes ?? [];
        const k: Kind = p.kind ?? "thought";
        return (
          <div className={`card sd-post ${k}`} key={p.id}>
            <div className="phead">
              <b>{p.authorName}</b><span className="badge">{p.role}</span>
              <span className={`badge ${k === "achievement" ? "orange" : ""}`}>{KIND_LABEL[k]}</span>
              <span className="muted">{timeAgo(p.createdAt)}</span>
            </div>
            <p>{p.content}</p>
            <button className="btn like" type="button" onClick={() => void like(p.id)}>
              {likes.includes(me.uid) ? "❤️" : "🤍"} {likes.length}
            </button>
          </div>
        );
      })}
      {shown.length === 0 && <p className="muted">Nothing here yet — be the first to post!</p>}
    </>
  );
}

/* =================== MY PROJECTS =================== */
function MyProjectsView({ me, notify }: { me: User; notify: Notify }): JSX.Element {
  const projects = useWatch<Project>("projects");
  const [tab, setTab] = useState<"mine" | "all">("mine");
  const [title, setTitle] = useState("");
  const [desc, setDesc] = useState("");
  const [link, setLink] = useState("");

  const sorted = useMemo(() => [...projects].sort((a, b) => b.createdAt - a.createdAt), [projects]);
  const mine = sorted.filter((p) => p.studentUid === me.uid);
  const shown = tab === "mine" ? mine : sorted;

  const publish = async (): Promise<void> => {
    if (!title.trim()) { notify("Project title is required", "error"); return; }
    await add("projects", {
      studentUid: me.uid, studentName: me.name, title: title.trim(),
      description: desc.trim(), link: link.trim(), likes: [], createdAt: Date.now(),
    });
    setTitle(""); setDesc(""); setLink("");
    setTab("mine");
    notify("Project uploaded 🎉");
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
        <h3>Upload a project</h3>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Project title" />
        <textarea rows={3} value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="What did you build and what did you learn?" />
        <input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Project link (GitHub, Google Drive, YouTube…)" />
        <button className="btn primary" type="button" onClick={() => void publish()}>Upload project</button>
      </div>

      <div className="tabs">
        <button type="button" className={`tab${tab === "mine" ? " on" : ""}`} onClick={() => setTab("mine")}>My Projects ({mine.length})</button>
        <button type="button" className={`tab${tab === "all" ? " on" : ""}`} onClick={() => setTab("all")}>Class Gallery ({sorted.length})</button>
      </div>

      <div className="grid2">
        {shown.map((p) => {
          const likes = p.likes ?? [];
          return (
            <div className="card sd-proj" key={p.id}>
              <h3>{p.title}</h3>
              {p.description && <p>{p.description}</p>}
              {p.link && <a href={p.link} target="_blank" rel="noopener noreferrer">🔗 Open project</a>}
              <div className="phead">
                <small className="muted">by <b>{p.studentName}</b> · {timeAgo(p.createdAt)}</small>
                <button className="btn like" type="button" onClick={() => void like(p.id)}>
                  {likes.includes(me.uid) ? "❤️" : "🤍"} {likes.length}
                </button>
              </div>
            </div>
          );
        })}
      </div>
      {shown.length === 0 && (
        <p className="muted">{tab === "mine" ? "You haven't uploaded anything yet — add your first project above." : "No projects yet."}</p>
      )}
    </>
  );
}
