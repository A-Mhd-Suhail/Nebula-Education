import { useRef, useState } from "react";
import type { FormEvent, PointerEvent, ReactNode, SVGProps } from "react";
import type { Role } from "./firebase";
import "./auth.css";

type AuthMode = "login" | "register";

interface Props {
  mode: AuthMode;
  role: Role;
  setRole: (r: Role) => void;
  stuId: string;
  error: string;
  busy: boolean;
  onSwitch: (m: AuthMode) => void;
  onLogin: (e: FormEvent<HTMLFormElement>) => void;
  onRegister: (e: FormEvent<HTMLFormElement>) => void;
  onBack: () => void;
}

const svgProps: SVGProps<SVGSVGElement> = {
  viewBox: "0 0 24 24", fill: "none", stroke: "currentColor",
  strokeWidth: 1.8, strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true,
};

const Icon = ({ children }: { children: ReactNode }): JSX.Element => <svg {...svgProps}>{children}</svg>;

const I = {
  mail: <Icon><rect x="3" y="5" width="18" height="14" rx="3" /><path d="m4 8 8 6 8-6" /></Icon>,
  lock: <Icon><rect x="5" y="11" width="14" height="9" rx="3" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></Icon>,
  user: <Icon><circle cx="12" cy="8" r="4" /><path d="M4 20c1.5-4 5-5 8-5s6.5 1 8 5" /></Icon>,
  id: <Icon><rect x="3" y="5" width="18" height="14" rx="3" /><circle cx="9" cy="11" r="2" /><path d="M14 10h4M14 14h3M6.5 16c.6-1.4 1.7-2 2.5-2s1.9.6 2.5 2" /></Icon>,
  book: <Icon><path d="M5 4h14v16H7a2 2 0 0 1-2-2z" /><path d="M9 8h6M9 12h4" /></Icon>,
  eye: <Icon><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>,
  eyeOff: <Icon><path d="M3 3l18 18" /><path d="M6.6 7.6C3.9 9.3 2 12 2 12s3.5 7 10 7c1.5 0 2.8-.3 4-.8M10.6 5.1A9 9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 3.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Icon>,
  arrow: <Icon><path d="M19 12H5m6-6-6 6 6 6" /></Icon>,
  alert: <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16v.01" /></Icon>,
};

const ROLES: { v: Role; label: string }[] = [
  { v: "student", label: "Student" },
  { v: "teacher", label: "Teacher" },
  { v: "hm", label: "Head Master" },
  { v: "meo", label: "MEO" },
  { v: "deo", label: "DEO" },
];

function Field({ label, icon, children }: { label: string; icon: ReactNode; children: ReactNode }): JSX.Element {
  return (
    <label className="ag-field">
      <span className="ag-label">{label}</span>
      <span className="ag-input">{icon}{children}</span>
    </label>
  );
}

function PasswordField({ placeholder, autoComplete }: { placeholder: string; autoComplete: string }): JSX.Element {
  const [show, setShow] = useState(false);
  return (
    <Field label="Password" icon={I.lock}>
      <input name="password" type={show ? "text" : "password"} required minLength={6}
        placeholder={placeholder} autoComplete={autoComplete} />
      <button type="button" className="ag-eye" onClick={() => setShow((s) => !s)}
        aria-label={show ? "Hide password" : "Show password"}>
        {show ? I.eyeOff : I.eye}
      </button>
    </Field>
  );
}

export default function AuthView(p: Props): JSX.Element {
  const { mode, role, stuId, error, busy } = p;
  const cardRef = useRef<HTMLDivElement>(null);

  // Light follows the cursor + a very subtle 3D tilt (mouse only)
  const onMove = (e: PointerEvent<HTMLDivElement>): void => {
    const el = cardRef.current;
    if (!el || e.pointerType !== "mouse") return;
    const r = el.getBoundingClientRect();
    const x = (e.clientX - r.left) / r.width;
    const y = (e.clientY - r.top) / r.height;
    el.style.setProperty("--mx", `${x * 100}%`);
    el.style.setProperty("--my", `${y * 100}%`);
    el.style.setProperty("--rx", `${(0.5 - y) * 4}deg`);
    el.style.setProperty("--ry", `${(x - 0.5) * 4}deg`);
  };
  const onLeave = (): void => {
    const el = cardRef.current;
    if (!el) return;
    ["--mx", "--my", "--rx", "--ry"].forEach((k) => el.style.removeProperty(k));
  };

  const isLogin = mode === "login";

  return (
    <div className="ag-wrap">
      <div className="ag-bg" aria-hidden="true">
        <i className="ag-orb o1" /><i className="ag-orb o2" /><i className="ag-orb o3" /><i className="ag-orb o4" />
      </div>

      <div className="ag-stage">
        <i className="ag-drop d1" aria-hidden="true" />
        <div className="ag-card" ref={cardRef} onPointerMove={onMove} onPointerLeave={onLeave}>
          <div className="ag-body">
            <div className="ag-brand">
              <span className="ag-logo">
                <svg viewBox="0 0 40 40" aria-hidden="true">
                  <defs>
                    <linearGradient id="agG" x1="0" y1="0" x2="1" y2="1">
                      <stop offset="0" stopColor="#c4b5fd" /><stop offset="1" stopColor="#60a5fa" />
                    </linearGradient>
                  </defs>
                  <circle cx="20" cy="20" r="5.5" fill="url(#agG)" />
                  <ellipse cx="20" cy="20" rx="15" ry="6" transform="rotate(-30 20 20)" stroke="url(#agG)" strokeWidth="1.6" fill="none" />
                  <ellipse cx="20" cy="20" rx="15" ry="6" transform="rotate(30 20 20)" stroke="url(#agG)" strokeWidth="1.2" fill="none" opacity=".5" />
                  <circle cx="32" cy="11" r="1.8" fill="#fff" />
                </svg>
              </span>
              <span className="ag-brand-name">Nebula Education</span>
            </div>

            <h1 className="ag-title">{isLogin ? "Welcome back" : "Create your account"}</h1>
            <p className="ag-sub">{isLogin ? "Sign in to continue to your classroom." : "Join Nebula Education in under a minute."}</p>

            <div className="ag-seg" data-mode={mode} role="tablist">
              <span className="ag-thumb" />
              <button type="button" role="tab" aria-selected={isLogin} className={isLogin ? "on" : ""} onClick={() => p.onSwitch("login")}>Login</button>
              <button type="button" role="tab" aria-selected={!isLogin} className={!isLogin ? "on" : ""} onClick={() => p.onSwitch("register")}>Register</button>
            </div>

            {isLogin ? (
              <form key="login" className="ag-form" onSubmit={p.onLogin}>
                <Field label="Email" icon={I.mail}>
                  <input name="email" type="email" required placeholder="you@school.edu" autoComplete="email" />
                </Field>
                <PasswordField placeholder="Enter your password" autoComplete="current-password" />
                {error && <p className="ag-err" key={error} role="alert">{I.alert}<span>{error}</span></p>}
                <button className="ag-btn" type="submit" disabled={busy}>
                  {busy ? <span className="ag-spin" aria-label="Signing in" /> : "Login"}
                </button>
              </form>
            ) : (
              <form key="register" className="ag-form" onSubmit={p.onRegister}>
                <Field label="Full name" icon={I.user}>
                  <input name="name" required placeholder="Your name" autoComplete="name" />
                </Field>
                <Field label="Email" icon={I.mail}>
                  <input name="email" type="email" required placeholder="you@school.edu" autoComplete="email" />
                </Field>
                <PasswordField placeholder="At least 6 characters" autoComplete="new-password" />

                <span className="ag-label">Role</span>
                <div className="ag-roles" role="radiogroup" aria-label="Role">
                  {ROLES.map((r) => (
                    <button key={r.v} type="button" role="radio" aria-checked={role === r.v}
                      className={`ag-chip${role === r.v ? " on" : ""}`} onClick={() => p.setRole(r.v)}>
                      {r.label}
                    </button>
                  ))}
                </div>
                <input type="hidden" name="role" value={role} />

                {role === "student" && (
                  <div className="ag-row ag-extra">
                    <Field label="Student ID" icon={I.id}>
                      <input name="studentId" readOnly value={stuId} />
                    </Field>
                    <Field label="Class" icon={I.book}>
                      <input name="class" placeholder="Class 10-A" />
                    </Field>
                  </div>
                )}
                {role === "teacher" && (
                  <div className="ag-row ag-extra">
                    <Field label="Subject" icon={I.book}>
                      <input name="subject" placeholder="Mathematics" />
                    </Field>
                    <Field label="Class" icon={I.id}>
                      <input name="class-t" placeholder="Class 10-A" />
                    </Field>
                  </div>
                )}

                {error && <p className="ag-err" key={error} role="alert">{I.alert}<span>{error}</span></p>}
                <button className="ag-btn" type="submit" disabled={busy}>
                  {busy ? <span className="ag-spin" aria-label="Creating account" /> : "Create account"}
                </button>
              </form>
            )}

            <button className="ag-back" type="button" onClick={p.onBack}>{I.arrow}<span>Back to home</span></button>
          </div>
        </div>
        <i className="ag-drop d2" aria-hidden="true" />
      </div>
    </div>
  );
}
