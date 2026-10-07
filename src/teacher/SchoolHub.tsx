// src/teacher/SchoolHub.tsx — Me with School: meetings · announcements · salary · staff attendance & timing
import { useState } from "react";
import { db, set, update } from "../firebase";
import type { Attendance, User } from "../firebase";
import { doc, deleteDoc } from "firebase/firestore";
import { todayStr } from "../ui";
import type { Notify } from "../views";
import ProfilePage from "../social/ProfilePage";
import { VBadge, Empty } from "../social/kit";
import {
  useCol, canModerate, todayISO, addMeeting, addAnnouncement, addSalary, addEvent,
  verifyTeacher, type MeetingDoc, type SalaryDoc, type AnnDoc, type EventDoc,
} from "../social/data";
import "../social/social.css";

interface TimingDoc {
  id: string; date: string; teacherUid: string; teacherName: string;
  className?: string; subject?: string; status?: string;
  lateMin?: number; earlyMin?: number; entryAt?: number; exitAt?: number;
}

type Tab = "meetings" | "notices" | "salary" | "timing" | "staff";

export default function SchoolHub({ me, notify }: { me: User; notify: Notify }): JSX.Element {
  const mod = canModerate(me.role);
  const [tab, setTab] = useState<Tab>("meetings");
  const [viewUid, setViewUid] = useState<string | null>(null);
  const meetings = useCol<MeetingDoc>("meetings").slice().sort((a, b) => b.at - a.at);
  const notices = useCol<AnnDoc>("announcements").slice().sort((a, b) => b.at - a.at);
  const salaries = useCol<SalaryDoc>("salaries").slice().sort((a, b) => b.at - a.at);
  const events = useCol<EventDoc>("events").slice().sort((a, b) => a.date.localeCompare(b.date));
  const timings = useCol<TimingDoc>("teacher_timing", ["date", todayISO()]);
  const attToday = useCol<Attendance>("attendance", ["date", todayStr()]).filter((a) => a.role === "teacher");
  const users = useCol<User>("users");
  const teachers = users.filter((u) => u.role === "teacher");

  if (viewUid) {
    return <ProfilePage me={me} notify={notify} uid={viewUid} onBack={() => setViewUid(null)} />;
  }

  return (
    <>
      <div className="tabs">
        {([["meetings", "🏛 Meetings"], ["notices", "📣 Announcements"], ["salary", "💰 Salary"], ["timing", "⏱ Attendance & Timing"], ["staff", "👩‍🏫 Staff"]] as Array<[Tab, string]>).map(([k, l]) => (
          <button key={k} type="button" className={`tab${tab === k ? " on" : ""}`} onClick={() => setTab(k)}>{l}</button>
        ))}
      </div>

      {tab === "meetings" && (
        <>
          {mod && <MeetingForm me={me} notify={notify} teachers={teachers} onEvent={() => notify("Added to academic calendar")} />}
          {meetings.length === 0 && <Empty>No meetings scheduled.</Empty>}
          {meetings.map((m) => (
            <div className="card" key={m.id}>
              <h3>{m.title}</h3>
              <p className="sc-mini">🗓 {m.when || "—"} · 📍 {m.place || "—"} · by {m.by}</p>
              {m.agenda && <p>{m.agenda}</p>}
            </div>
          ))}
        </>
      )}

      {tab === "notices" && (
        <>
          {mod && <NoticeForm me={me} notify={notify} />}
          {notices.length === 0 && <Empty>No announcements.</Empty>}
          {notices.map((n) => (
            <div className="card" key={n.id}>
              <div className="phead"><b>{n.title}</b><span className="sc-badge kind">{n.audience}</span><span className="sc-mini">{n.by}</span></div>
              <p>{n.body}</p>
            </div>
          ))}
        </>
      )}

      {tab === "salary" && (
        <>
          {mod && <SalaryForm teachers={teachers} notify={notify} />}
          {(mod ? salaries : salaries.filter((s) => s.teacherUid === me.uid)).map((s) => (
            <div className="card" key={s.id}>
              <div className="phead"><b>{s.teacherName}</b><span className={`sc-badge ${s.status === "paid" ? "priv" : "role"}`}>{s.status}</span><span className="sc-mini">{s.month}</span></div>
              <p className="sc-kv"><span>Amount</span><b>₹ {s.amount}</b></p>
              {s.note && <p className="sc-mini">{s.note}</p>}
            </div>
          ))}
          {!mod && salaries.filter((s) => s.teacherUid === me.uid).length === 0 && <Empty>No salary slips yet.</Empty>}
        </>
      )}

      {tab === "timing" && (
        <>
          <div className="card">
            <h3>⏱ Faculty check-ins today</h3>
            <ul className="plain">
              {attToday.map((a) => <li key={a.id}>{a.name} <span className="muted">({a.method})</span></li>)}
              {attToday.length === 0 && <li className="muted">No check-ins yet today.</li>}
            </ul>
          </div>
          <div className="card">
            <h3>📊 Timing maintenance</h3>
            {timings.length === 0 && <Empty>No timing records today (hardware bridge or manual check-in fills this).</Empty>}
            {timings.map((t) => (
              <div className="sc-kv" key={t.id}>
                <span>{t.teacherName} · {t.className ?? "—"} {t.subject ? `· ${t.subject}` : ""}</span>
                <span className="sc-mini">
                  {t.status === "late" ? `🟡 late ${t.lateMin ?? 0}m` : t.status === "early_exit" ? `🟠 early ${t.earlyMin ?? 0}m` : "🟢 on time"}
                  {t.exitAt ? " · out" : ""}
                </span>
              </div>
            ))}
          </div>
          <ManualTiming me={me} timings={timings} notify={notify} />
        </>
      )}

      {tab === "staff" && (
        <div className="card">
          <h3>👩‍🏫 Faculty directory</h3>
          {teachers.length === 0 && <Empty>No teachers yet.</Empty>}
          {teachers.map((t) => (
            <StaffRow key={t.uid} t={t} mod={mod} me={me} notify={notify}
              onProfile={() => setViewUid(t.uid)} />
          ))}
        </div>
      )}
    </>
  );
}

function ManualTiming({ me, timings, notify }: { me: User; timings: TimingDoc[]; notify: Notify }): JSX.Element {
  const mine = timings.find((t) => t.teacherUid === me.uid && t.id.includes("-manual-"));
  return (
    <div className="card">
      <h3>🖐 Manual timing (works without hardware)</h3>
      {mine ? (
        <button className="btn" type="button" onClick={async () => {
          await update("teacher_timing", mine.id, { exitAt: Date.now() });
          notify("Checked out ✓");
        }}>Check out</button>
      ) : (
        <button className="btn primary" type="button" onClick={async () => {
          await set("teacher_timing", `${me.uid}-manual-${todayISO()}`, {
            date: todayISO(), teacherUid: me.uid, teacherName: me.name,
            className: me.className ?? null, subject: me.subject ?? null,
            status: "on_time", lateMin: 0, entryAt: Date.now(),
          });
          notify("Checked in ✓");
        }}>Check in</button>
      )}
    </div>
  );
}

function MeetingForm({ me, notify, teachers, onEvent }: {
  me: User; notify: Notify; teachers: User[]; onEvent: () => void;
}): JSX.Element {
  const [title, setTitle] = useState(""); const [when, setWhen] = useState("");
  const [place, setPlace] = useState(""); const [agenda, setAgenda] = useState("");
  const [evTitle, setEvTitle] = useState(""); const [evDate, setEvDate] = useState("");
  const [evClass, setEvClass] = useState("ALL"); const [evNote, setEvNote] = useState("");
  return (
    <div className="card">
      <h3>➕ Schedule a meeting</h3>
      <div className="sc-form">
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Meeting title" />
        <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
        <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Place" />
        <textarea rows={2} value={agenda} onChange={(e) => setAgenda(e.target.value)} placeholder="Agenda" />
        <button className="btn primary" type="button" onClick={() => {
          if (!title.trim()) { notify("Title required", "error"); return; }
          void addMeeting(me, title, when, place, agenda);
          setTitle(""); setWhen(""); setPlace(""); setAgenda("");
          notify("Meeting scheduled 🏛");
        }}>Schedule</button>
      </div>
      <h4>📅 Add to academic calendar</h4>
      <div className="sc-form">
        <input value={evTitle} onChange={(e) => setEvTitle(e.target.value)} placeholder="Event title" />
        <div className="sc-grid">
          <input type="date" value={evDate} onChange={(e) => setEvDate(e.target.value)} />
          <input value={evClass} onChange={(e) => setEvClass(e.target.value)} placeholder="Class or ALL" />
        </div>
        <input value={evNote} onChange={(e) => setEvNote(e.target.value)} placeholder="Note" />
        <button className="btn" type="button" onClick={() => {
          if (!evTitle.trim() || !evDate) { notify("Title and date required", "error"); return; }
          void addEvent(me, evTitle, evDate, evClass, evNote);
          setEvTitle(""); setEvDate(""); setEvNote("");
          onEvent();
        }}>Add event</button>
      </div>
      <p className="sc-mini">{teachers.length} teachers on staff.</p>
    </div>
  );
}

function NoticeForm({ me, notify }: { me: User; notify: Notify }): JSX.Element {
  const [title, setTitle] = useState(""); const [body, setBody] = useState("");
  const [aud, setAud] = useState("all");
  return (
    <div className="card">
      <h3>📣 Post an announcement</h3>
      <div className="sc-form">
        <select value={aud} onChange={(e) => setAud(e.target.value)}>
          <option value="all">Everyone</option><option value="teachers">Teachers</option>
          <option value="students">Students</option><option value="Class 10-A">Specific class (type below)</option>
        </select>
        {aud === "Class 10-A" && <input value={aud} onChange={(e) => setAud(e.target.value)} placeholder="Class name e.g., Class 9-B" />}
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title" />
        <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Announcement" />
        <button className="btn primary" type="button" onClick={() => {
          if (!title.trim()) { notify("Title required", "error"); return; }
          void addAnnouncement(me, title, body, aud);
          setTitle(""); setBody("");
          notify("Announcement posted 📣");
        }}>Post</button>
      </div>
    </div>
  );
}

function SalaryForm({ teachers, notify }: { teachers: User[]; notify: Notify }): JSX.Element {
  const [tid, setTid] = useState(teachers[0]?.uid ?? "");
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [amount, setAmount] = useState("");
  const [status, setStatus] = useState("paid");
  const [note, setNote] = useState("");
  return (
    <div className="card">
      <h3>💰 Post salary slip</h3>
      <div className="sc-form">
        <select value={tid} onChange={(e) => setTid(e.target.value)}>
          {teachers.map((t) => <option key={t.uid} value={t.uid}>{t.name}</option>)}
        </select>
        <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="Amount ₹" />
        <select value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="paid">Paid</option><option value="pending">Pending</option>
        </select>
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" />
        <button className="btn primary" type="button" onClick={() => {
          const t = teachers.find((x) => x.uid === tid);
          if (!t || !amount) { notify("Pick teacher and amount", "error"); return; }
          void addSalary(t, month, Number(amount), status, note);
          setAmount(""); setNote("");
          notify("Salary slip posted 💰");
        }}>Post slip</button>
      </div>
    </div>
  );
}

function StaffRow({ t, mod, me, notify, onProfile }: {
  t: User; mod: boolean; me: User; notify: Notify; onProfile: () => void;
}): JSX.Element {
  const prof = useCol<import("../social/data").Profile>("profiles", ["uid", t.uid])[0];
  const [busy, setBusy] = useState(false);
  return (
    <div className="sc-kv">
      <span>
        <button type="button" className="sc-author" onClick={onProfile}><b>{t.name}</b></button>
        <span className="sc-mini"> · {t.subject ?? "—"} · {t.className ?? "—"}</span> <VBadge p={prof} />
      </span>
      {mod && (
        <span className="sc-rowbtns">
          <button className="btn like" type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            await verifyTeacher(t.uid, "government");
            setBusy(false); notify(`${t.name} marked Government-verified 🛡`);
          }}>🛡 Gov</button>
          <button className="btn like" type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            await verifyTeacher(t.uid, "private");
            setBusy(false); notify(`${t.name} marked Verified ✔`);
          }}>✔ Private</button>
          <button className="btn like" type="button" disabled={busy} onClick={async () => {
            setBusy(true);
            await verifyTeacher(t.uid, null);
            setBusy(false); notify("Badge cleared");
          }}>✕</button>
          {t.uid !== me.uid && (
            <button className="btn like" type="button" onClick={async () => {
              await deleteDoc(doc(db, "trash", `${me.uid}-${t.uid}-${Date.now()}`)).catch(() => undefined);
              notify("Use Message from their profile to reach out");
            }}>💬</button>
          )}
        </span>
      )}
    </div>
  );
}
