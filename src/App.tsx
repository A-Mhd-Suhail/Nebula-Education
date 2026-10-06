import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, updateProfile,
} from "firebase/auth";
import type { User as FBUser } from "firebase/auth";
import { auth, authErr, configured, get, set } from "./firebase";
import type { Role, User } from "./firebase";
import { Portal } from "./views";

type Mode = "home" | "login" | "register" | "app";

const makeId = (p: string): string =>
  `${p}-${new Date().getFullYear()}-${Math.random().toString(36).slice(2, 6).toUpperCase().padEnd(4, "X")}`;

const val = (f: FormData, k: string): string => String(f.get(k) ?? "").trim();

export default function App(): JSX.Element {
  const [mode, setMode] = useState<Mode>("home");
  const [me, setMe] = useState<User | null>(null);
  const [toast, setToast] = useState<{ msg: string; ok: boolean } | null>(null);
  const [loginErr, setLoginErr] = useState("");
  const [regErr, setRegErr] = useState("");
  const [role, setRole] = useState<Role>("student");
  const [stuId, setStuId] = useState(makeId("STU"));

  const notify = useCallback((msg: string, type: "success" | "error" = "success") => {
    setToast({ msg, ok: type === "success" });
  }, []);

  useEffect(() => {
    if (!toast) return;
    const t = window.setTimeout(() => setToast(null), 3200);
    return () => window.clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    const handle = async (u: FBUser | null): Promise<void> => {
      if (!u) { setMe(null); setMode("home"); return; }
      let profile = await get<User>("users", u.uid);
      for (let i = 0; !profile && i < 10; i++) {
        await new Promise((r) => setTimeout(r, 400));
        profile = await get<User>("users", u.uid);
      }
      if (!profile) { notify("Profile missing — please register.", "error"); await signOut(auth); return; }
      setMe(profile);
      setMode("app");
    };
    return onAuthStateChanged(auth, (u) => { void handle(u); });
  }, [notify]);

  const openAuth = (m: "login" | "register"): void => {
    setLoginErr(""); setRegErr("");
    if (m === "register") setStuId(makeId("STU"));
    setMode(m);
  };

  const doLogin = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    try {
      await signInWithEmailAndPassword(auth, val(f, "email"), String(f.get("password") ?? ""));
      setLoginErr("");
    } catch (err) {
      setLoginErr(authErr(err));
    }
  };

  const doRegister = async (e: FormEvent<HTMLFormElement>): Promise<void> => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const name = val(f, "name");
    const email = val(f, "email").toLowerCase();
    const pw = String(f.get("password") ?? "");
    const r = String(f.get("role") ?? "student") as Role;
    if (!name || !email || !pw) { setRegErr("Please fill all fields."); return; }

    const data: Record<string, unknown> = { name, email, role: r, airScore: 0, createdAt: Date.now() };
    if (r === "student") {
      data.studentId = val(f, "studentId") || makeId("STU");
      data.className = val(f, "class") || "Class 10-A";
    }
    if (r === "teacher") {
      data.teacherId = makeId("TCH");
      data.subject = val(f, "subject") || "General";
      data.className = val(f, "class-t") || "Class 10-A";
    }

    try {
      const cred = await createUserWithEmailAndPassword(auth, email, pw);
      try { await updateProfile(cred.user, { displayName: name }); } catch { /* noop */ }
      await set("users", cred.user.uid, { ...data, uid: cred.user.uid });
      setRegErr("");
      notify("Account created 🎉");
    } catch (err) {
      setRegErr(authErr(err));
    }
  };

  return (
    <>
      {mode === "home" && (
        <div className="home">
          <nav className="nav">
            <div className="brand">🌌 <span>Nebula Education</span></div>
            <div className="nav-actions">
              <button className="btn ghost" type="button" onClick={() => openAuth("login")}>Login</button>
              <button className="btn primary" type="button" onClick={() => openAuth("register")}>Register</button>
            </div>
          </nav>
          <section className="hero">
            <h1>Learning that reaches <span className="grad">the stars</span></h1>
            <p>Smart School Platform — Student · Teacher · HM · MEO · DEO. Live classes, attendance, doubts, quizzes and leaderboards in one place.</p>
            <div className="hero-actions">
              <button className="btn primary" type="button" onClick={() => openAuth("register")}>🚀 Get Started</button>
              <button className="btn ghost" type="button" onClick={() => openAuth("login")}>Login</button>
            </div>
          </section>
          <section className="features">
            <div className="feature"><h3>📶 3-Device Class</h3><p>Tab ⇄ Hardware ⇄ Teacher's Hood — live attendance, notes and class tests.</p></div>
            <div className="feature"><h3>⚡ Air Score</h3><p>Earn points from quizzes and participation. Climb the leaderboard.</p></div>
            <div className="feature"><h3>❓ Doubts & Projects</h3><p>Ask teachers directly and showcase your work to the whole school.</p></div>
          </section>
        </div>
      )}

      {(mode === "login" || mode === "register") && (
        <div className="auth-wrap">
          <div className="auth-card">
            <div className="auth-brand">🌌 <span>Nebula Education</span></div>
            <h1>{mode === "login" ? "Welcome back" : "Create your account"}</h1>
            <div className="auth-tabs">
              <button type="button" className={mode === "login" ? "on" : ""} onClick={() => openAuth("login")}>Login</button>
              <button type="button" className={mode === "register" ? "on" : ""} onClick={() => openAuth("register")}>Register</button>
            </div>
            {mode === "login" ? (
              <form onSubmit={(e) => void doLogin(e)}>
                <label>Email <input name="email" type="email" required placeholder="you@school.edu" /></label>
                <label>Password <input name="password" type="password" required minLength={6} placeholder="••••••••" /></label>
                <button className="btn primary block" type="submit">Login</button>
                <p className="err">{loginErr}</p>
              </form>
            ) : (
              <form onSubmit={(e) => void doRegister(e)}>
                <label>Full name <input name="name" required placeholder="Your name" /></label>
                <label>Email <input name="email" type="email" required placeholder="you@school.edu" /></label>
                <label>Password <input name="password" type="password" required minLength={6} /></label>
                <label>Role
                  <select name="role" value={role} onChange={(e) => setRole(e.target.value as Role)}>
                    <option value="student">Student</option>
                    <option value="teacher">Teacher</option>
                    <option value="hm">Head Master (HM)</option>
                    <option value="meo">MEO</option>
                    <option value="deo">DEO</option>
                  </select>
                </label>
                {role === "student" && (
                  <div className="fields">
                    <label>Student ID <input name="studentId" readOnly value={stuId} /></label>
                    <label>Class <input name="class" placeholder="Class 10-A" /></label>
                  </div>
                )}
                {role === "teacher" && (
                  <div className="fields">
                    <label>Subject <input name="subject" placeholder="Mathematics" /></label>
                    <label>Class <input name="class-t" placeholder="Class 10-A" /></label>
                  </div>
                )}
                <button className="btn primary block" type="submit">Create account</button>
                <p className="err">{regErr}</p>
              </form>
            )}
            <button className="btn block back" type="button" onClick={() => setMode("home")}>← Back to home</button>
          </div>
        </div>
      )}

      {mode === "app" && me && (
        <Portal me={me} notify={notify} onLogout={() => { void signOut(auth); }} />
      )}

      {!configured && (
        <div className="banner">⚠️ Add your Firebase keys to the .env file, then restart the dev server.</div>
      )}

      <div className={`toast ${toast ? (toast.ok ? "success" : "error") : "hidden"}`}>{toast?.msg ?? ""}</div>
    </>
  );
}
