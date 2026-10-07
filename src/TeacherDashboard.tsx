import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import {
  add, list, update,
  type Assignment, type Attendance, type Doubt, type QuizDoc, type Rating, type Session, type User,
} from "./firebase";
import { stars, timeAgo, todayStr } from "./ui";
import { FALLBACK, SocialView, TimetableView, medal, useWatch } from "./views";
import type { Notify } from "./views";
import CloudMenu from "./CloudMenu";
import type { CloudItem } from "./CloudMenu";
import { useSectionNav } from "./useSectionNav";
import "./student.css";
import "./teacher.css";
import ProfilePage from "./social/ProfilePage";
import SocialHub from "./social/SocialHub";
import SchoolHub from "./teacher/SchoolHub";
import NoiseGuard from "./teacher/NoiseGuard";
import "./social/social.css";

type View =
  | "home" | "profile" | "live" | "push" | "tests" | "homework" | "doubts"
  | "timetable" | "social" | "leaderboard" | "ratings" | "attendance" | "school" | "guard";
type SectionKey = Exclude<View, "home">;

const noopQuiz = (): void => undefined;

/* ---------- icons ---------- */
const Ic = ({ children }: { children: ReactNode }): JSX.Element => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{children}</svg>
);
const ICONS: Record<SectionKey, JSX.Element> = {
  profile: <Ic><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-7 8-7s8 3 8 7" /></Ic>,
  live: <Ic><circle cx="12" cy="12" r="2" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 7.8a6 6 0 0 1 0 8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 4.9a10 10 0 0 1 0 14.2" /></Ic>,
  push: <Ic><path d="M12 19V5M6 11l6-6 6 6" /><path d="M5 21h14" /></Ic>,
  tests: <Ic><rect x="5" y="4" width="14" height="17" rx="2" /><path d="M9 4V3h6v1M9 12l2 2 4-4" /></Ic>,
  homework: <Ic><path d="M4 5a2 2 0 0 1 2-2h13v16H6a2 2 0 0 0-2 2z" /><path d="M4 19V5M9 8h6" /></Ic>,
  doubts: <Ic><circle cx="12" cy="12" r="9" /><path d="M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.4-1 .9-1 1.7M12 17v.01" /></Ic>,
  timetable: <Ic><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M3 10h18M8 3v4M16 3v4" /></Ic>,
  social: <Ic><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></Ic>,
  leaderboard: <Ic><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z" /><path d="M7 6H4v2a3 3 0 0 0 3 3M17 6h3v2a3 3 0 0 1-3 3" /></Ic>,
  ratings: <Ic><path d="m12 3 2.8 5.7 6.2.9-4.5 4.4 1 6.2L12 17.2 6.5 20.2l1-6.2L3 9.6l6.2-.9z" /></Ic>,
  attendance: <Ic><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c0-3.5 3-6 6.5-6s6.5 2.5 6.5 6M16 5a3.5 3.5 0 0 1 0 7M18 14c2 .6 3.5 2.4 3.5 6" /></Ic>,
  school: <Ic><path d="M3 21h18M5 21V9l7-5 7 5v12" /><path d="M9 21v-6h6v6" /></Ic>,
  guard: <Ic><path d="M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6z" /><path d="m9 12 2 2 4-4" /></Ic>,
};
const HomeIcon = (): JSX.Element => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M3 11.5 12 4l9 7.5" /><path d="M5 10v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9" /><path d="M9.5 20v-5h5v5" />
  </svg>
);
const Glyph = (): JSX.Element => (
  <svg className="sd-glyph" viewBox="0 0 24 24" fill="none" strokeWidth="1.5" aria-hidden="true">
    <rect x="3" y="3" width="12" height="12" stroke="#2f9bff" />
    <rect x="9" y="9" width="12" height="12" stroke="#ff9a2e" />
    <path d="M3 3l6 6M15 3l6 6M3 15l6 6M15 15l6 6" stroke="#8fd6ff" />
  </svg>
);

/* =================== SHELL =================== */
export default function TeacherPortal({ me, notify, onLogout }: { me: User; notify: Notify; onLogout: () => void }): JSX.Element {
  const [view, go] = useSectionNav<View>("home");

  const sessions = useWatch<Session>("sessions", ["active", true]);
  const doubts = useWatch<Doubt>("doubts");
  const ratings = useWatch<Rating>("ratings");
  const assigns = useWatch<Assignment>("assignments");

  const mine = useMemo(() => sessions.find((s) => s.teacherUid === me.uid) ?? null, [sessions, me.uid]);
  const myRatings = useMemo(
    () => ratings.filter((r) => r.teacherUid === me.uid).sort((a, b) => b.createdAt - a.createdAt), [ratings, me.uid]);
  const avg = myRatings.length ? myRatings.reduce((s, r) => s + r.stars, 0) / myRatings.length : 0;
  const open = doubts.filter((d) => d.status !== "solved").length;
  const posted = assigns.filter((a) => a.by === me.name).length;

  const clouds: Array<CloudItem & { key: SectionKey }> = [
    { key: "profile", label: "My Profile", sub: "Full faculty profile", desc: "Banner, photo, bio, education, verification, portfolio and Air Score.", icon: ICONS.profile },
    { key: "live", label: "Live Class", sub: mine ? `${mine.subject} · ${mine.className}` : "Start or end class",
      desc: "Start your class (marks attendance and links student Tabs) or end it.", icon: ICONS.live, badge: mine ? "● LIVE" : undefined },
    { key: "push", label: "Push to Tabs", sub: "Notes & videos", desc: "Send notes or video links to every student Tab in your live class.", icon: ICONS.push },
    { key: "tests", label: "Class Tests", sub: "Send a quick test", desc: "Send a quiz to student Tabs during your live class.", icon: ICONS.tests },
    { key: "homework", label: "Homework", sub: "Post · Assignments", desc: "Post homework or assignments and see what you posted.", icon: ICONS.homework,
      badge: posted > 0 ? `${posted} posted` : undefined },
    { key: "doubts", label: "Doubt Solve", sub: "Student questions", desc: "Answer doubts posted by students.", icon: ICONS.doubts,
      badge: open > 0 ? `${open} open` : undefined },
    { key: "timetable", label: "Time Table", sub: "Syllabus calendar", desc: "Plan topics by date and track syllabus completion.", icon: ICONS.timetable },
    { key: "social", label: "Faculty Social", sub: "Posts · Sync · Messages", desc: "Achievements, posts, Sync, messages and profile visits.", icon: ICONS.social },
    { key: "school", label: "Me with School", sub: "Meetings · Salary · Notices", desc: "School meetings, salary slips, announcements, staff attendance and timing.", icon: ICONS.school },
    { key: "guard", label: "Noise Guard", sub: "Classroom alarm", desc: "Live mic monitor and classroom noise alarm.", icon: ICONS.guard },
    { key: "leaderboard", label: "Leaderboard", sub: "Top students", desc: "Air Score ranking of students.", icon: ICONS.leaderboard },
    { key: "ratings", label: "My Ratings", sub: myRatings.length ? `${avg.toFixed(1)} / 5` : "Student feedback",
      desc: "Ratings and comments students gave you.", icon: ICONS.ratings },
    { key: "attendance", label: "Attendance", sub: "Today's check-ins", desc: "Who has checked in today.", icon: ICONS.attendance },
  ];

  const section = clouds.find((c) => c.key === view);
  const props = { me, notify, showQuiz: noopQuiz };

  const body = (k: SectionKey): JSX.Element => {
    switch (k) {
      case "profile": return <ProfilePage me={me} notify={notify} uid={me.uid} />;
      case "live": return <LiveSection me={me} mine={mine} notify={notify} go={go} />;
      case "push": return <PushSection mine={mine} notify={notify} go={go} />;
      case "tests": return <TestsSection mine={mine} notify={notify} go={go} />;
      case "homework": return <HomeworkSection me={me} mine={mine} assigns={assigns} notify={notify} />;
      case "doubts": return <DoubtsSection doubts={doubts} me={me} notify={notify} />;
      case "timetable": return <TimetableView {...props} />;
      case "social": return <SocialHub me={me} notify={notify} />;
      case "school": return <SchoolHub me={me} notify={notify} />;
      case "guard": return <NoiseGuard me={me} notify={notify} />;
      case "leaderboard": return <LeaderboardSection me={me} />;
      case "ratings": return <RatingsSection ratings={myRatings} avg={avg} />;
      case "attendance": return <AttendanceSection />;
    }
  };

  return (
    <div className="sd">
      <header className="sd-top">
        <div className={`sd-crumbs${section ? " in-sec" : ""}`}>
          {section && (
            <button type="button" className="sd-home" onClick={() => go("home")} aria-label="Back to Home">
              <HomeIcon /><span>Home</span>
            </button>
          )}
          <button type="button" className="sd-title" onClick={() => go("home")} aria-label="Go to dashboard">
            <Glyph /><span>Teacher Dashboard</span>
          </button>
          {section && <><span className="sd-sep">/</span><span className="sd-cur">{section.label}</span></>}
        </div>
        <div className="sd-user">
          <span className="sd-ava" aria-hidden="true">{me.name.trim().charAt(0).toUpperCase() || "T"}</span>
          <span className="sd-uname"><b>{me.name}</b><small>Teacher</small></span>
          <button type="button" className="sd-logout" onClick={onLogout}>Logout</button>
        </div>
      </header>

      <div className="sd-wrap">
        {!section ? (
          <TeacherHome me={me} mine={mine} avg={avg} rated={myRatings.length} open={open} posted={posted}
            clouds={clouds} go={go} />
        ) : (
          <div className="sd-section" key={view}>
            <div className="sd-head">
              <h1>{section.label}</h1>
              <p>{section.desc}</p>
            </div>
            {body(section.key)}
          </div>
        )}
      </div>
    </div>
  );
}

/* =================== HOME: summary + clouds =================== */
function TeacherHome({ me, mine, avg, rated, open, posted, clouds, go }: {
  me: User; mine: Session | null; avg: number; rated: number; open: number; posted: number;
  clouds: CloudItem[]; go: (v: View) => void;
}): JSX.Element {
  const hour = new Date().getHours();
  const greet = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const today = new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" });
  const tiles: Array<[string, string, string]> = [
    ["Rating", rated ? avg.toFixed(1) : "—", rated ? `from ${rated} student rating${rated === 1 ? "" : "s"}` : "no ratings yet"],
    ["Open doubts", String(open), open ? "waiting for an answer" : "all clear"],
    ["Posted", String(posted), "homework & assignments"],
    ["Class today", mine ? "LIVE" : "—", mine ? `${mine.subject} · ${mine.className}` : "not started"],
  ];

  return (
    <>
      <section className="sd-welcome">
        <div>
          <p className="sd-eyebrow">{today}</p>
          <h1>{greet}, {me.name.trim().split(/\s+/)[0]}</h1>
          <p className="sd-meta">
            <span>{me.subject ?? "Subject —"}</span><i />
            <span>{me.className ?? "Class —"}</span><i />
            <span>ID {me.teacherId ?? "—"}</span>
          </p>
        </div>
        <button type="button" className={`sd-live${mine ? " on" : ""}`} onClick={() => go("live")}>
          <span className="dot" />
          {mine ? `Live now · ${mine.subject} · ${mine.className}` : "Class not started · tap to start"}
        </button>
      </section>

      <section className="sd-tiles" aria-label="Your summary">
        {tiles.map(([label, value, hint]) => (
          <div className="sd-tile" key={label}>
            <span>{label}</span><b>{value}</b><small>{hint}</small>
          </div>
        ))}
      </section>

      <CloudMenu items={clouds} onSelect={(k) => go(k as View)} />
    </>
  );
}

/* =================== small helpers =================== */
function Tabs<T extends string>({ value, onChange, items }: {
  value: T; onChange: (v: T) => void; items: Array<[T, string]>;
}): JSX.Element {
  return (
    <div className="tabs">
      {items.map(([k, label]) => (
        <button key={k} type="button" className={`tab${value === k ? " on" : ""}`} onClick={() => onChange(k)}>{label}</button>
      ))}
    </div>
  );
}

function NeedClass({ go }: { go: (v: View) => void }): JSX.Element {
  return (
    <div className="card">
      <h3>🔴 No live class</h3>
      <p className="hint">Start your class first — then you can send content and tests to student Tabs.</p>
      <button className="btn primary" type="button" onClick={() => go("live")}>Go to Live Class</button>
    </div>
  );
}

/* =================== 1 · PROFILE =================== */
function ProfileSection({ me }: { me: User }): JSX.Element {
  return (
    <div className="card">
      <h3>👤 My Profile</h3>
      <div className="prow"><span>Name</span><b>{me.name}</b></div>
      <div className="prow"><span>Email</span><b>{me.email}</b></div>
      <div className="prow"><span>Role</span><b>{me.role.toUpperCase()}</b></div>
      <div className="prow"><span>Teacher ID</span><b>{me.teacherId ?? "—"}</b></div>
      <div className="prow"><span>Subject</span><b>{me.subject ?? "—"}</b></div>
      <div className="prow"><span>Class</span><b>{me.className ?? "—"}</b></div>
    </div>
  );
}

/* =================== 2 · LIVE CLASS =================== */
function LiveSection({ me, mine, notify, go }: { me: User; mine: Session | null; notify: Notify; go: (v: View) => void }): JSX.Element {
  const [subject, setSubject] = useState(me.subject ?? "");
  const [cls, setCls] = useState(me.className ?? "");

  const start = async (): Promise<void> => {
    const sub = subject.trim() || me.subject || "General";
    const room = cls.trim() || me.className || "Class 10-A";
    await add("sessions", {
      teacherUid: me.uid, teacherName: me.name, subject: sub, className: room,
      startedAt: Date.now(), active: true,
    });
    const rows = await list<Attendance>("attendance", ["date", todayStr()]);
    if (!rows.some((a) => a.uid === me.uid)) {
      await add("attendance", { date: todayStr(), uid: me.uid, name: me.name, role: "teacher", method: "hood-login", createdAt: Date.now() });
    }
    notify("Class started ✅");
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
      <div className="card">
        <h3>Your class is running</h3>
        <p className="muted">Send material to student Tabs, or wrap up when you are done.</p>
        <div className="tc-actions">
          <button className="btn primary" type="button" onClick={() => go("push")}>📤 Push notes / video</button>
          <button className="btn" type="button" onClick={() => go("tests")}>🧪 Send a test</button>
          <button className="btn danger" type="button" onClick={() => void end()}>⏹ End class</button>
        </div>
      </div>
    </>
  );
}

/* =================== 3 · PUSH TO TABS =================== */
function PushSection({ mine, notify, go }: { mine: Session | null; notify: Notify; go: (v: View) => void }): JSX.Element {
  const [type, setType] = useState<"note" | "video">("note");
  const [text, setText] = useState("");
  if (!mine) return <NeedClass go={go} />;

  const push = async (): Promise<void> => {
    if (!text.trim()) { notify("Write something", "error"); return; }
    await add("contents", { sessionId: mine.id, type, text: text.trim(), createdAt: Date.now() });
    setText("");
    notify("Pushed to Tabs 📱");
  };

  return (
    <div className="card">
      <div className="live">🔴 LIVE — {mine.subject} · {mine.className}</div>
      <h3>📤 Push to student Tabs</h3>
      <Tabs value={type} onChange={setType} items={[["note", "📒 Note"], ["video", "🎬 Video link"]]} />
      <textarea rows={3} value={text} onChange={(e) => setText(e.target.value)}
        placeholder={type === "video" ? "Paste the video URL" : "Type your note"} />
      <button className="btn primary" type="button" onClick={() => void push()}>Push</button>
    </div>
  );
}

/* =================== 4 · CLASS TESTS =================== */
function TestsSection({ mine, notify, go }: { mine: Session | null; notify: Notify; go: (v: View) => void }): JSX.Element {
  const rows = useWatch<QuizDoc>("quizzes");
  const tests = rows.length ? rows : FALLBACK;
  if (!mine) return <NeedClass go={go} />;

  const send = async (q: QuizDoc): Promise<void> => {
    await add("contents", {
      sessionId: mine.id, type: "test", text: q.question,
      quiz: { question: q.question, options: q.options, correctIndex: q.correctIndex, subject: q.subject },
      createdAt: Date.now(),
    });
    notify("Test sent to Tabs 🧪");
  };

  return (
    <div className="card">
      <div className="live">🔴 LIVE — {mine.subject} · {mine.className}</div>
      <h3>🧪 Send a class test</h3>
      {tests.map((q) => (
        <div className="qrow" key={q.id}>
          <span>{q.question}</span>
          <button className="btn" type="button" onClick={() => void send(q)}>Send</button>
        </div>
      ))}
    </div>
  );
}

/* =================== 5 · HOMEWORK & ASSIGNMENTS =================== */
function HomeworkSection({ me, mine, assigns, notify }: {
  me: User; mine: Session | null; assigns: Assignment[]; notify: Notify;
}): JSX.Element {
  const [tab, setTab] = useState<"post" | "hw" | "asg">("post");
  const [kind, setKind] = useState<"homework" | "assignment">("homework");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");

  const mineRows = useMemo(
    () => assigns.filter((a) => a.by === me.name).sort((a, b) => b.createdAt - a.createdAt), [assigns, me.name]);
  const hw = mineRows.filter((a) => a.kind !== "assignment");
  const asg = mineRows.filter((a) => a.kind === "assignment");

  const post = async (): Promise<void> => {
    if (!title.trim()) { notify("Title required", "error"); return; }
    await add("assignments", {
      title: title.trim(), due, subject: mine?.subject ?? me.subject ?? "General",
      by: me.name, kind, createdAt: Date.now(),
    });
    setTitle(""); setDue("");
    notify(kind === "assignment" ? "Assignment posted 📝" : "Homework posted 📘");
    setTab(kind === "assignment" ? "asg" : "hw");
  };

  const renderRows = (rows: Assignment[], empty: string): JSX.Element => (
    rows.length ? (
      <>
        {rows.map((a) => (
          <div className="card" key={a.id}>
            <h3>{a.title}</h3>
            <p className="muted">{a.subject ?? "General"} · Due: {a.due || "—"} · {timeAgo(a.createdAt)}</p>
          </div>
        ))}
      </>
    ) : <p className="muted">{empty}</p>
  );

  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[
        ["post", "✍️ Post new"], ["hw", `📘 Homework (${hw.length})`], ["asg", `📝 Assignments (${asg.length})`],
      ]} />
      {tab === "post" && (
        <div className="card">
          <h3>📘 Post homework / assignment</h3>
          <select value={kind} onChange={(e) => setKind(e.target.value as "homework" | "assignment")}>
            <option value="homework">📘 Homework</option>
            <option value="assignment">📝 Assignment</option>
          </select>
          <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
          <input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
          <button className="btn primary" type="button" onClick={() => void post()}>Post</button>
        </div>
      )}
      {tab === "hw" && renderRows(hw, "You haven't posted any homework yet.")}
      {tab === "asg" && renderRows(asg, "You haven't posted any assignments yet.")}
    </>
  );
}

/* =================== 6 · DOUBT SOLVE =================== */
function DoubtsSection({ doubts, me, notify }: { doubts: Doubt[]; me: User; notify: Notify }): JSX.Element {
  const [tab, setTab] = useState<"open" | "solved" | "all">("open");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const sorted = useMemo(() => [...doubts].sort((a, b) => b.createdAt - a.createdAt), [doubts]);
  const open = sorted.filter((d) => d.status !== "solved");
  const solved = sorted.filter((d) => d.status === "solved");
  const shown = tab === "open" ? open : tab === "solved" ? solved : sorted;

  const send = async (id: string): Promise<void> => {
    const answer = (answers[id] ?? "").trim();
    if (!answer) { notify("Write an answer", "error"); return; }
    await update("doubts", id, { status: "solved", answer, answeredBy: me.name });
    notify("Answer sent ✅");
  };

  return (
    <>
      <Tabs value={tab} onChange={setTab} items={[
        ["open", `🟠 Open (${open.length})`], ["solved", `✅ Solved (${solved.length})`], ["all", "All"],
      ]} />
      {shown.map((d) => (
        <div className={`card doubt ${d.status}`} key={d.id}>
          <div className="phead">
            <b>{d.studentName}</b><span className="badge">{d.subject}</span>
            <span className={`badge ${d.status === "solved" ? "green" : "orange"}`}>{d.status}</span>
            <span className="muted">{timeAgo(d.createdAt)}</span>
          </div>
          <p><b>Q:</b> {d.question}</p>
          {d.status === "solved" ? (
            <p className="answer"><b>✅ {d.answeredBy ?? "Teacher"}:</b> {d.answer}</p>
          ) : (
            <>
              <textarea rows={2} placeholder="Write your answer…"
                value={answers[d.id] ?? ""}
                onChange={(e) => setAnswers((p) => ({ ...p, [d.id]: e.target.value }))} />
              <button className="btn primary" type="button" onClick={() => void send(d.id)}>Send Answer</button>
            </>
          )}
        </div>
      ))}
      {shown.length === 0 && <p className="muted">{tab === "open" ? "No open doubts — all clear! 🎉" : "Nothing here yet."}</p>}
    </>
  );
}

/* =================== 9 · LEADERBOARD =================== */
function LeaderboardSection({ me }: { me: User }): JSX.Element {
  const users = useWatch<User>("users");
  const students = useMemo(
    () => users.filter((u) => u.role === "student").sort((a, b) => b.airScore - a.airScore), [users]);
  return (
    <div className="card">
      <h3>🏆 Air Score Leaderboard</h3>
      <ol className="lb">
        {students.slice(0, 20).map((s, i) => (
          <li key={s.uid} className={s.uid === me.uid ? "me" : ""}>
            <span className="rk">{medal(i)}</span><span className="nm">{s.name}</span>
            <span className="muted">{s.className ?? ""}</span><b>{s.airScore}</b>
          </li>
        ))}
        {students.length === 0 && <li className="muted">No students yet.</li>}
      </ol>
    </div>
  );
}

/* =================== 10 · RATINGS =================== */
function RatingsSection({ ratings, avg }: { ratings: Rating[]; avg: number }): JSX.Element {
  return (
    <div className="card">
      <h3>⭐ Teacher Performance</h3>
      <div className="rate">
        <div className="big">{ratings.length ? avg.toFixed(1) : "—"}<small>/5</small></div>
        <div>{stars(avg)}<br /><span className="muted">{ratings.length} rating(s)</span></div>
      </div>
      <h4>Comments</h4>
      <ul className="comments">
        {ratings.slice(0, 20).map((r) => (
          <li key={r.id}><b>{r.studentName}</b> {stars(r.stars)}<p>{r.comment}</p></li>
        ))}
        {ratings.length === 0 && <li className="muted">No comments yet.</li>}
      </ul>
    </div>
  );
}

/* =================== 11 · ATTENDANCE =================== */
function AttendanceSection(): JSX.Element {
  const [tab, setTab] = useState<"students" | "teachers">("students");
  const att = useWatch<Attendance>("attendance", ["date", todayStr()]);
  const users = useWatch<User>("users");
  const totalStudents = users.filter((u) => u.role === "student").length;
  const stu = att.filter((a) => a.role === "student");
  const tch = att.filter((a) => a.role === "teacher");
  const pct = totalStudents ? Math.round((stu.length / totalStudents) * 100) : 0;
  const rows = tab === "students" ? stu : tch;

  return (
    <>
      <div className="stats">
        <div className="card stat"><h3>{stu.length}/{totalStudents || "—"}</h3><p className="muted">Students present</p></div>
        <div className="card stat"><h3>{pct}%</h3><p className="muted">Attendance today</p></div>
      </div>
      <Tabs value={tab} onChange={setTab} items={[["students", `🎓 Students (${stu.length})`], ["teachers", `🧑‍🏫 Teachers (${tch.length})`]]} />
      <div className="card">
        <ul className="plain">
          {rows.map((a) => <li key={a.id}>{a.name} <span className="muted">({a.method})</span></li>)}
          {rows.length === 0 && <li className="muted">No check-ins yet today.</li>}
        </ul>
      </div>
    </>
  );
}
