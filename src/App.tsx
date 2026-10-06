import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword, onAuthStateChanged, signInWithEmailAndPassword,
  signOut, updateProfile,
} from "firebase/auth";
import type { User as FBUser } from "firebase/auth";
import { auth, authErr, configured, get, set } from "./firebase";
import type { Role, User } from "./firebase";
import HomeBgCanvas from "./HomeBgCanvas";
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
  const [contactOk, setContactOk] = useState("");

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
        <>
          <HomeBgCanvas />
          <div className="veil"></div>

          <header className="pentagon-header">
            <a className="brand" href="#home" aria-label="The Pentagon Inc home">
              <svg viewBox="0 0 40 40" fill="none">
                <polygon points="20,3 37,15.5 30.5,35.5 9.5,35.5 3,15.5" stroke="#2f9bff" strokeWidth="2.2" fill="rgba(47,155,255,.12)" />
                <polygon points="20,12 29,18.5 25.6,29 14.4,29 11,18.5" stroke="#ff9a2e" strokeWidth="1.6" />
                <circle cx="20" cy="20.5" r="2.4" fill="#ff9a2e" />
              </svg>
              <span>The Pentagon Inc</span>
            </a>
            <nav className="pentagon-nav" aria-label="Main">
              <a href="#about">About</a>
              <a href="#vision">Vision 2030</a>
              <a href="#contact">Contact</a>
              <button type="button" className="nav-link" onClick={() => openAuth("login")}>Login</button>
              <button type="button" className="nav-link nav-btn-hot" onClick={() => openAuth("register")}>Register</button>
            </nav>
          </header>

          <main className="pentagon-main">
            <section className="hero pentagon-sec pentagon-hero" id="home">
              <h1>The Pentagon Inc</h1>
              <p>We build intelligent systems that think, connect and scale, so your organisation can see further and move faster.</p>
              <div className="cta">
                <a className="btn-pentagon hot" href="#vision">See Vision 2030</a>
                <a className="btn-pentagon" href="#contact">Talk to us</a>
                <button className="btn-pentagon" type="button" onClick={() => openAuth("login")}>Login</button>
                <button className="btn-pentagon hot" type="button" onClick={() => openAuth("register")}>Register</button>
              </div>
            </section>

            <section className="pentagon-sec" id="about">
              <h2>About us</h2>
              <p className="lead">The Pentagon Inc is a technology company built around five disciplines. Each one is a point of the same structure, and together they work like a single connected mind.</p>
              <div className="cols">
                <div className="pentagon-card">
                  <h3>Intelligence</h3>
                  <p>Data and AI that turn scattered information into decisions you can act on.</p>
                </div>
                <div className="pentagon-card">
                  <h3>Engineering</h3>
                  <p>Reliable software and platforms, designed to run for years, not demos.</p>
                </div>
                <div className="pentagon-card">
                  <h3>Connection</h3>
                  <p>Systems that link people, devices and teams so nothing works in isolation.</p>
                </div>
              </div>
            </section>

            <section className="pentagon-sec" id="vision">
              <h2>Vision 2030</h2>
              <p className="lead">By 2030 we aim to be the neural backbone behind the organisations we serve: always learning, always connected.</p>
              <div className="cols">
                <div className="pentagon-card">
                  <span className="year">2026</span>
                  <h3>Foundation</h3>
                  <p>Establish our core platform and the teams that run it.</p>
                </div>
                <div className="pentagon-card">
                  <span className="year">2028</span>
                  <h3>Expansion</h3>
                  <p>Bring the platform to new sectors and regions with local partners.</p>
                </div>
                <div className="pentagon-card">
                  <span className="year">2030</span>
                  <h3>Intelligence at scale</h3>
                  <p>A connected network that learns from every deployment and improves for all.</p>
                </div>
              </div>
            </section>

            <section className="pentagon-sec pentagon-contact" id="contact">
              <h2>Contact</h2>
              <p className="lead">Tell us what you want to build. We reply within two working days.</p>
              <div className="contact-wrap">
                <form id="f" onSubmit={(e) => {
                  e.preventDefault();
                  setContactOk("Message sent. We will reply within two working days.");
                  e.currentTarget.reset();
                }}>
                  <input name="name" placeholder="Your name" required aria-label="Your name" />
                  <input name="email" type="email" placeholder="Email address" required aria-label="Email address" />
                  <textarea name="msg" rows={4} placeholder="How can we help?" required aria-label="Message"></textarea>
                  <button className="btn-pentagon hot" type="submit">Send message</button>
                  <p id="ok" role="status">{contactOk}</p>
                </form>
                <div className="info">
                  <div><b>Email</b>hello@thepentagon.inc</div>
                  <div><b>Phone</b>+91 00000 00000</div>
                  <div><b>Office</b>Your address here</div>
                </div>
              </div>
            </section>
          </main>
          <footer className="pentagon-footer">© 2026 The Pentagon Inc. All rights reserved.</footer>
        </>
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
