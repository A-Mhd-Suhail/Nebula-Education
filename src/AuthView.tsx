import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent, ReactNode, SVGProps } from "react";
import type { Role } from "./firebase";
import HomeBgCanvas from "./HomeBgCanvas";
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

/* ---------- dropdown data (edit freely) ---------- */
const SUBJECTS = [
  "Mathematics", "Science", "English", "Social Studies", "Hindi",
  "Telugu", "Physics", "Chemistry", "Biology", "Computer Science",
];
const CLASSES = Array.from({ length: 12 }, (_, i) => `Class ${i + 1}`);
const SECTIONS = ["A", "B", "C", "D", "E", "F", "G", "H"].map((s) => `Section ${s}`);

const ROLES: { v: Role; label: string }[] = [
  { v: "student", label: "Student" },
  { v: "teacher", label: "Teacher" },
  { v: "hm", label: "Head Master" },
  { v: "meo", label: "MEO" },
  { v: "deo", label: "DEO" },
];

/* ---------- icons ---------- */
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
  cap: <Icon><path d="m3 9 9-5 9 5-9 5z" /><path d="M7 11.5V16c0 1 2.2 2.5 5 2.5s5-1.5 5-2.5v-4.5" /></Icon>,
  grid: <Icon><rect x="4" y="4" width="6" height="6" rx="1.5" /><rect x="14" y="4" width="6" height="6" rx="1.5" /><rect x="4" y="14" width="6" height="6" rx="1.5" /><rect x="14" y="14" width="6" height="6" rx="1.5" /></Icon>,
  eye: <Icon><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" /><circle cx="12" cy="12" r="3" /></Icon>,
  eyeOff: <Icon><path d="M3 3l18 18" /><path d="M6.6 7.6C3.9 9.3 2 12 2 12s3.5 7 10 7c1.5 0 2.8-.3 4-.8M10.6 5.1A9 9 0 0 1 12 5c6.5 0 10 7 10 7a17 17 0 0 1-3.2 3.8" /><path d="M9.9 9.9a3 3 0 0 0 4.2 4.2" /></Icon>,
  arrow: <Icon><path d="M19 12H5m6-6-6 6 6 6" /></Icon>,
  alert: <Icon><circle cx="12" cy="12" r="9" /><path d="M12 7.5v5M12 16v.01" /></Icon>,
  search: <Icon><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4-4" /></Icon>,
  chevron: <Icon><path d="m6 9 6 6 6-6" /></Icon>,
  check: <Icon><path d="m5 12.5 4.5 4.5L19 7.5" /></Icon>,
};

/* ---------- search ranking: starts-with > word-starts-with > contains ---------- */
const rank = (opt: string, q: string): number => {
  const o = opt.toLowerCase();
  if (o.startsWith(q)) return 0;
  if (o.split(/\s+/).some((w) => w.startsWith(q))) return 1;
  return o.includes(q) ? 2 : -1;
};

/* ---------- searchable dropdown ---------- */
interface SelectProps {
  label: string;
  icon: ReactNode;
  options: string[];
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  searchPlaceholder: string;
}

function Select({ label, icon, options, value, onChange, placeholder, searchPlaceholder }: SelectProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [act, setAct] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const trig = useRef<HTMLButtonElement>(null);
  const inp = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();

  // only matching options are shown, best matches first
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options
      .map((o, i) => ({ o, i, r: rank(o, s) }))
      .filter((x) => x.r >= 0)
      .sort((a, b) => a.r - b.r || a.i - b.i)
      .map((x) => x.o);
  }, [options, q]);

  const close = (): void => { setOpen(false); setQ(""); };
  const openIt = (): void => {
    setAct(Math.max(0, options.indexOf(value)));
    setOpen(true);
  };
  const choose = (v: string): void => { onChange(v); close(); trig.current?.focus(); };

  useEffect(() => { if (open) inp.current?.focus(); }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent): void => {
      if (root.current && !root.current.contains(e.target as Node)) { setOpen(false); setQ(""); }
    };
    document.addEventListener("pointerdown", onDown);
    return () => document.removeEventListener("pointerdown", onDown);
  }, [open]);

  useEffect(() => {
    if (open) (list.current?.children[act] as HTMLElement | undefined)?.scrollIntoView({ block: "nearest" });
  }, [act, open, shown]);

  const onSearchKey = (e: KeyboardEvent<HTMLInputElement>): void => {
    if (e.key === "ArrowDown") { e.preventDefault(); setAct((i) => Math.min(i + 1, shown.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setAct((i) => Math.max(i - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (shown[act]) choose(shown[act]); }
    else if (e.key === "Escape") { e.preventDefault(); close(); trig.current?.focus(); }
    else if (e.key === "Tab") close();
  };

  return (
    <div className={`ag-field${open ? " is-open" : ""}`} ref={root}>
      <span className="ag-label" id={`${id}-l`}>{label}</span>
      <div className="ag-sel">
        <button type="button" ref={trig} className="ag-input ag-trigger" aria-haspopup="listbox"
          aria-expanded={open} aria-labelledby={`${id}-l`}
          onClick={() => (open ? close() : openIt())}
          onKeyDown={(e) => { if (e.key === "ArrowDown" && !open) { e.preventDefault(); openIt(); } }}>
          {icon}
          <span className={value ? "ag-val" : "ag-val ph"}>{value || placeholder}</span>
          <span className="ag-chev">{I.chevron}</span>
        </button>

        {open && (
          <div className="ag-pop">
            <div className="ag-search">
              {I.search}
              <input ref={inp} value={q} placeholder={searchPlaceholder} autoComplete="off"
                role="combobox" aria-expanded="true" aria-controls={id} aria-label={searchPlaceholder}
                aria-activedescendant={shown[act] ? `${id}-${act}` : undefined}
                onChange={(e) => { setQ(e.target.value); setAct(0); }} onKeyDown={onSearchKey} />
            </div>
            <ul className="ag-list" role="listbox" id={id} ref={list}>
              {shown.length === 0 ? (
                <li className="ag-empty">No matches found</li>
              ) : shown.map((o, i) => (
                <li key={o} id={`${id}-${i}`} role="option" aria-selected={o === value}
                  className={`${i === act ? "act" : ""}${o === value ? " sel" : ""}`}
                  onMouseEnter={() => setAct(i)} onClick={() => choose(o)}>
                  <span>{o}</span>{o === value && I.check}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}

/* ---------- plain text field ---------- */
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

/* ---------- main view ---------- */
export default function AuthView(p: Props): JSX.Element {
  const { mode, role, stuId, error, busy } = p;
  const isLogin = mode === "login";

  const [subject, setSubject] = useState("");
  const [cls, setCls] = useState("");
  const [sec, setSec] = useState("");
  const [localErr, setLocalErr] = useState("");

  const classValue = cls && sec ? `${cls}-${sec.replace("Section ", "")}` : ""; // e.g. "Class 10-A"
  const shownErr = localErr || error;

  const switchTo = (m: AuthMode): void => { setLocalErr(""); p.onSwitch(m); };

  const submitRegister = (e: FormEvent<HTMLFormElement>): void => {
    if (role === "student" && (!cls || !sec)) {
      e.preventDefault(); setLocalErr("Please select your class and section."); return;
    }
    if (role === "teacher" && (!subject || !cls || !sec)) {
      e.preventDefault(); setLocalErr("Please select your subject, class and section."); return;
    }
    setLocalErr("");
    p.onRegister(e);
  };

  const classSection = (
    <div className="ag-row ag-extra">
      <Select label="Class" icon={I.cap} options={CLASSES} value={cls} onChange={(v) => { setCls(v); setLocalErr(""); }}
        placeholder="Select class" searchPlaceholder="Search class…" />
      <Select label="Section" icon={I.grid} options={SECTIONS} value={sec} onChange={(v) => { setSec(v); setLocalErr(""); }}
        placeholder="Select section" searchPlaceholder="Search section…" />
    </div>
  );

  return (
    <div className="ag-wrap">
      <HomeBgCanvas />
      <div className="ag-veil" />

      <header className="ag-top">
        <button type="button" className="ag-brand" onClick={p.onBack} aria-label="The Pentagon Inc home">
          <svg viewBox="0 0 40 40" fill="none" aria-hidden="true">
            <polygon points="20,3 37,15.5 30.5,35.5 9.5,35.5 3,15.5" stroke="#2f9bff" strokeWidth="2.2" fill="rgba(47,155,255,.12)" />
            <polygon points="20,12 29,18.5 25.6,29 14.4,29 11,18.5" stroke="#ff9a2e" strokeWidth="1.6" />
            <circle cx="20" cy="20.5" r="2.4" fill="#ff9a2e" />
          </svg>
          <span>The Pentagon Inc</span>
        </button>
        <button type="button" className="ag-home" onClick={p.onBack}>{I.arrow}<span>Back to home</span></button>
      </header>

      <main className="ag-main">
        <div className="ag-card">
          <h1 className="ag-title">{isLogin ? "Welcome back" : "Create your account"}</h1>
          <p className="ag-sub">{isLogin ? "Sign in to continue to your classroom." : "Register to join your school on The Pentagon Inc."}</p>

          <div className="ag-tabs" data-mode={mode} role="tablist">
            <button type="button" role="tab" aria-selected={isLogin} className={isLogin ? "on" : ""} onClick={() => switchTo("login")}>Login</button>
            <button type="button" role="tab" aria-selected={!isLogin} className={!isLogin ? "on" : ""} onClick={() => switchTo("register")}>Register</button>
            <span className="ag-ink" />
          </div>

          {isLogin ? (
            <form key="login" className="ag-form" onSubmit={p.onLogin}>
              <Field label="Email" icon={I.mail}>
                <input name="email" type="email" required placeholder="you@school.edu" autoComplete="email" />
              </Field>
              <PasswordField placeholder="Enter your password" autoComplete="current-password" />
              {shownErr && <p className="ag-err" key={shownErr} role="alert">{I.alert}<span>{shownErr}</span></p>}
              <button className="ag-btn" type="submit" disabled={busy}>
                {busy ? <span className="ag-spin" aria-label="Signing in" /> : "Login"}
              </button>
            </form>
          ) : (
            <form key="register" className="ag-form" onSubmit={submitRegister}>
              <Field label="Full name" icon={I.user}>
                <input name="name" required placeholder="Your name" autoComplete="name" />
              </Field>
              <Field label="Email" icon={I.mail}>
                <input name="email" type="email" required placeholder="you@school.edu" autoComplete="email" />
              </Field>
              <PasswordField placeholder="At least 6 characters" autoComplete="new-password" />

              <div className="ag-field">
                <span className="ag-label">Role</span>
                <div className="ag-roles" role="radiogroup" aria-label="Role">
                  {ROLES.map((r) => (
                    <button key={r.v} type="button" role="radio" aria-checked={role === r.v}
                      className={`ag-chip${role === r.v ? " on" : ""}`} onClick={() => p.setRole(r.v)}>
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>
              <input type="hidden" name="role" value={role} />

              {role === "student" && (
                <>
                  <Field label="Student ID" icon={I.id}>
                    <input name="studentId" readOnly value={stuId} />
                  </Field>
                  {classSection}
                  <input type="hidden" name="class" value={classValue} />
                </>
              )}
              {role === "teacher" && (
                <>
                  <Select label="Subject" icon={I.book} options={SUBJECTS} value={subject}
                    onChange={(v) => { setSubject(v); setLocalErr(""); }}
                    placeholder="Select subject" searchPlaceholder="Search subject…" />
                  <input type="hidden" name="subject" value={subject} />
                  {classSection}
                  <input type="hidden" name="class-t" value={classValue} />
                </>
              )}

              {shownErr && <p className="ag-err" key={shownErr} role="alert">{I.alert}<span>{shownErr}</span></p>}
              <button className="ag-btn" type="submit" disabled={busy}>
                {busy ? <span className="ag-spin" aria-label="Creating account" /> : "Create account"}
              </button>
            </form>
          )}

          <p className="ag-switch">
            {isLogin ? "New to The Pentagon Inc?" : "Already have an account?"}
            <button type="button" onClick={() => switchTo(isLogin ? "register" : "login")}>{isLogin ? "Create an account" : "Sign in"}</button>
          </p>
        </div>
      </main>
    </div>
  );
}
