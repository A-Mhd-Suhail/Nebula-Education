// src/social/ProfilePage.tsx — universal rich profile (faculty + student, own + others)
import { useEffect, useMemo, useState } from "react";
import type { Project, User } from "../firebase";
import { timeAgo } from "../ui";
import type { Notify } from "../views";
import { Avatar, VBadge, RoleChip, Bar, Empty } from "./kit";
import ChatBox from "./ChatBox";
import {
  useCol, ensureProfile, saveProfile, registerView, isSynced, toggleSync,
  cgpaFrom, streakFrom, matchProfile,
  addCourse, setCourseProgress, toggleCourseDone, addGoal, toggleGoal,
  getUserDoc, type Profile, type PostDoc, type FollowDoc, type CourseDoc,
  type GoalDoc, type ViolationDoc,
} from "./data";
import "./social.css";

const lines = (v?: string[]): string[] => (v ?? []).filter(Boolean);

export default function ProfilePage({ me, notify, uid, onBack }: {
  me: User; notify: Notify; uid: string; onBack?: () => void;
}): JSX.Element {
  const isMe = uid === me.uid;
  const [prof, setProf] = useState<Profile | null>(null);
  const [other, setOther] = useState<User | null>(isMe ? me : null);
  const [editing, setEditing] = useState(false);
  const [synced, setSynced] = useState(false);
  const [chat, setChat] = useState(false);
  const [otherMarks, setOtherMarks] = useState<Array<{ score: number; total: number }>>([]);

  const followers = useCol<FollowDoc>("follows", ["followingUid", uid]);
  const myPosts = useCol<PostDoc>("posts", ["authorUid", uid]);
  const myProjects = useCol<Project>("projects", ["studentUid", uid]);
  const myCourses = useCol<CourseDoc>("courses", ["ownerUid", uid]);
  const myGoals = useCol<GoalDoc>("goals", ["ownerUid", uid]);
  const mySessions = useCol<{ id: string; uid: string; startedAt: number; endedAt?: number; violations: number; focus: number }>("studySessions", ["uid", uid]);
  const myViolations = useCol<ViolationDoc>("studyViolations", ["uid", uid]);
  const users = useCol<User>("users");

  useEffect(() => {
    let dead = false;
    void (async () => {
      const u = isMe ? me : await getUserDoc(uid);
      if (dead) return;
      setOther(u);
      const p = u ? await ensureProfile(u) : null;
      if (!dead) setProf(p);
      if (u && !isMe) { void registerView(uid, me.uid); setSynced(await isSynced(me.uid, uid)); }
      if (u && u.role === "student" && !isMe) {
        const m = await import("../firebase").then((f) => f.list<{ score: number; total: number }>("marks", ["studentUid", uid]).catch(() => []));
        if (!dead) setOtherMarks(m ?? []);
      }
    })();
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  /* edit form state (own profile only) */
  const [f, setF] = useState<Record<string, string>>({});
  const openEdit = (): void => {
    if (!prof) return;
    setF({
      headline: prof.headline ?? "", bio: prof.bio ?? "", about: prof.about ?? "",
      school: prof.school ?? "", academicYear: prof.academicYear ?? "", grade: prof.grade ?? "",
      yearsExperience: String(prof.yearsExperience ?? 0),
      education: lines(prof.education).join("\n"),
      achievements: lines(prof.achievements).join("\n"),
      skillsAcademic: lines(prof.skillsAcademic).join("\n"),
      skillsPhysical: lines(prof.skillsPhysical).join("\n"),
      interests: prof.interests ?? "", careerGoals: prof.careerGoals ?? "",
      learningGoals: prof.learningGoals ?? "", languages: prof.languages ?? "",
      strengths: prof.strengths ?? "", preferredCoLearner: prof.preferredCoLearner ?? "",
      verificationType: prof.verificationType ?? "none",
    });
    setEditing(true);
  };
  const save = async (): Promise<void> => {
    const split = (s: string): string[] => s.split(/\r?\n/).map((x) => x.trim()).filter(Boolean);
    await saveProfile(me.uid, {
      headline: f.headline, bio: f.bio, about: f.about,
      school: f.school, academicYear: f.academicYear, grade: f.grade,
      yearsExperience: Number(f.yearsExperience) || 0,
      education: split(f.education), achievements: split(f.achievements),
      skillsAcademic: split(f.skillsAcademic), skillsPhysical: split(f.skillsPhysical),
      interests: f.interests, careerGoals: f.careerGoals, learningGoals: f.learningGoals,
      languages: f.languages, strengths: f.strengths, preferredCoLearner: f.preferredCoLearner,
      verificationType: f.verificationType === "none" ? null : (f.verificationType as "government" | "private"),
      verified: f.verificationType !== "none",
    });
    setProf(await ensureProfile(me));
    setEditing(false);
    notify("Profile saved ⭐");
  };
  const pickImage = (key: "photo" | "banner", maxKB: number) => (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > maxKB * 1024) { notify(`Image too large — keep under ${maxKB} KB`, "error"); return; }
    const r = new FileReader();
    r.onload = () => { setF((p) => ({ ...p, [key]: String(r.result) })); };
    r.readAsDataURL(file);
  };
  const saveImages = async (): Promise<void> => {
    await saveProfile(me.uid, { photo: f.photo || undefined, banner: f.banner || undefined });
    setProf(await ensureProfile(me));
    notify("Photos updated");
  };

  /* derived */
  const role = prof?.role ?? other?.role ?? me.role;
  const isStudent = role === "student";
  const marks = isMe && isStudent
    ? useCol<{ score: number; total: number }>("marks", ["studentUid", me.uid])
    : otherMarks;
  const perf = cgpaFrom(marks);
  const streak = streakFrom([
    ...mySessions.filter((s) => s.endedAt).map((s) => new Date(s.startedAt).toISOString().slice(0, 10)),
    ...myViolations.length ? [] : mySessions.map((s) => new Date(s.startedAt).toISOString().slice(0, 10)),
  ]);
  const profileId = other?.studentId ?? other?.teacherId ?? "—";
  const current = myCourses.filter((c) => c.status === "current");
  const done = myCourses.filter((c) => c.status === "completed");
  const upcoming = myGoals.filter((g) => !g.done).sort((a, b) => a.due.localeCompare(b.due));

  /* co-learner suggestions (students) */
  const myBlob = prof ? `${prof.interests} ${prof.learningGoals} ${prof.strengths} ${prof.preferredCoLearner} ${prof.careerGoals}` : "";
  const suggestions = useMemo(() => {
    if (!isStudent) return [];
    return users
      .filter((u) => u.role === "student" && u.uid !== uid)
      .slice(0, 12)
      .map((u) => ({ u, same: u.className && u.className === other?.className ? 2 : 0 }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [users, uid, other?.className, isStudent]);

  if (chat && other && other.uid !== me.uid) {
    return <ChatBox me={me} other={other} notify={notify} onBack={() => setChat(false)} />;
  }

  return (
    <>
      {onBack && (
        <div className="sc-actions">
          <button className="btn" type="button" onClick={onBack}>← Back</button>
        </div>
      )}
      <div className="card">
        <div className="sc-banner" style={prof?.banner ? { backgroundImage: `url(${prof.banner})` } : undefined} />
        <div className="sc-head">
          <Avatar name={prof?.name ?? me.name} photo={prof?.photo} size={88} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 style={{ marginBottom: 4 }}>
              {prof?.name ?? me.name} <VBadge p={prof} /> <RoleChip role={role} />
            </h3>
            <p className="sc-mini">Profile ID: <b>{profileId}</b>{prof?.headline ? ` · ${prof.headline}` : ""}</p>
            <p className="sc-mini">
              ⚡ Air Score <b>{other?.airScore ?? me.airScore}</b> · 👁 {prof?.views ?? 0} views · ⚡ Sync {followers.length} · ⭐ Impressions {prof?.socialScore ?? 0}
            </p>
          </div>
          {!isMe && (
            <div className="sc-actions">
              <button className={`btn${synced ? " primary" : ""}`} type="button" onClick={async () => {
                const on = await toggleSync(me.uid, uid);
                setSynced(on);
                notify(on ? "Synced ⚡ You now follow this profile" : "Sync removed");
              }}>{synced ? "⚡ Synced" : "＋ Sync"}</button>
              <button className="btn" type="button" onClick={() => setChat(true)}>💬 Message</button>
            </div>
          )}
          {isMe && !editing && (
            <div className="sc-actions">
              <button className="btn primary" type="button" onClick={openEdit}>✏ Edit profile</button>
            </div>
          )}
        </div>
      </div>

      {editing && isMe && (
        <div className="card">
          <h3>✏ Edit profile</h3>
          <div className="sc-form">
            <label>Banner image (≤ 350 KB)</label>
            <input type="file" accept="image/*" onChange={pickImage("banner", 350)} />
            <label>Profile photo (≤ 250 KB)</label>
            <input type="file" accept="image/*" onChange={pickImage("photo", 250)} />
            <button className="btn" type="button" onClick={() => void saveImages()}>Save photos</button>
            <label>Headline</label>
            <input value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} placeholder="e.g., Physics faculty · 8 yrs · loves demos" />
            <label>Bio (education biography)</label>
            <textarea rows={3} value={f.bio} onChange={(e) => setF({ ...f, bio: e.target.value })} />
            <label>About</label>
            <textarea rows={3} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} />
            <div className="sc-grid">
              <span><label>School</label><input value={f.school} onChange={(e) => setF({ ...f, school: e.target.value })} /></span>
              <span><label>Academic year</label><input value={f.academicYear} onChange={(e) => setF({ ...f, academicYear: e.target.value })} placeholder="2025–26" /></span>
              {isStudent
                ? <span><label>Grade / Class</label><input value={f.grade} onChange={(e) => setF({ ...f, grade: e.target.value })} /></span>
                : <span><label>Experience (years)</label><input type="number" min={0} value={f.yearsExperience} onChange={(e) => setF({ ...f, yearsExperience: e.target.value })} /></span>}
            </div>
            <label>{isStudent ? "Academic information (one per line)" : "Education (degree, institution, year — one per line)"}</label>
            <textarea rows={3} value={isStudent ? f.grade && `Grade: ${f.grade}` : f.education}
              onChange={(e) => setF({ ...f, education: e.target.value })} placeholder={"B.Sc Mathematics, ABC College, 2019\nM.Sc, XYZ University, 2021"} />
            <label>Achievements (one per line)</label>
            <textarea rows={3} value={f.achievements} onChange={(e) => setF({ ...f, achievements: e.target.value })} />
            <div className="sc-grid">
              <span><label>Academic skills (one per line)</label><textarea rows={3} value={f.skillsAcademic} onChange={(e) => setF({ ...f, skillsAcademic: e.target.value })} /></span>
              <span><label>Physical skills (one per line)</label><textarea rows={3} value={f.skillsPhysical} onChange={(e) => setF({ ...f, skillsPhysical: e.target.value })} /></span>
            </div>
            <div className="sc-grid">
              <span><label>Interests</label><textarea rows={2} value={f.interests} onChange={(e) => setF({ ...f, interests: e.target.value })} /></span>
              <span><label>Career goals</label><textarea rows={2} value={f.careerGoals} onChange={(e) => setF({ ...f, careerGoals: e.target.value })} /></span>
              <span><label>Learning goals</label><textarea rows={2} value={f.learningGoals} onChange={(e) => setF({ ...f, learningGoals: e.target.value })} /></span>
              <span><label>Languages known</label><textarea rows={2} value={f.languages} onChange={(e) => setF({ ...f, languages: e.target.value })} /></span>
              <span><label>Personal strengths</label><textarea rows={2} value={f.strengths} onChange={(e) => setF({ ...f, strengths: e.target.value })} /></span>
              <span><label>Preferred co-learner / teacher type</label><textarea rows={2} value={f.preferredCoLearner} onChange={(e) => setF({ ...f, preferredCoLearner: e.target.value })} /></span>
            </div>
            {!isStudent && (
              <>
                <label>Verification badge</label>
                <select value={f.verificationType} onChange={(e) => setF({ ...f, verificationType: e.target.value })}>
                  <option value="none">None</option>
                  <option value="government">🛡 Government teacher</option>
                  <option value="private">✔ Private teacher</option>
                </select>
              </>
            )}
            <div className="sc-actions">
              <button className="btn primary" type="button" onClick={() => void save()}>Save profile</button>
              <button className="btn" type="button" onClick={() => setEditing(false)}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      <div className="card">
        <h3>🪪 Academic information</h3>
        <div className="sc-kv"><span>School</span><b>{prof?.school || "—"}</b></div>
        <div className="sc-kv"><span>Academic year</span><b>{prof?.academicYear || "—"}</b></div>
        {isStudent ? (
          <>
            <div className="sc-kv"><span>Grade / Class</span><b>{other?.className || prof?.grade || "—"}</b></div>
            <div className="sc-kv"><span>Academic average</span><b>{marks.length ? `${perf.avg}%  (CGPA ≈ ${perf.cgpa})` : "—"}</b></div>
          </>
        ) : (
          <>
            <div className="sc-kv"><span>Experience</span><b>{prof?.yearsExperience ? `${prof.yearsExperience} years` : "—"}</b></div>
            <div className="sc-kv"><span>Subject</span><b>{other?.subject || "—"}</b></div>
          </>
        )}
        <div className="sc-kv"><span>Learning streak</span><b>{isStudent ? `🔥 ${streak} day${streak === 1 ? "" : "s"}` : "—"}</b></div>
      </div>

      {(prof?.bio || prof?.about) && (
        <div className="card">
          <h3>📖 Bio & About</h3>
          {prof?.bio && <p>{prof.bio}</p>}
          {prof?.about && <p className="sc-mini">{prof.about}</p>}
        </div>
      )}

      {(lines(prof?.education).length > 0 || lines(prof?.achievements).length > 0) && (
        <div className="card">
          <h3>🎓 {isStudent ? "Academic records & Achievements" : "Education & Achievements"}</h3>
          <ul className="sc-list">{lines(prof?.education).map((x, i) => <li key={`e${i}`}>{x}</li>)}</ul>
          <ul className="sc-list">{lines(prof?.achievements).map((x, i) => <li key={`a${i}`}>🏆 {x}</li>)}</ul>
          {lines(prof?.education).length + lines(prof?.achievements).length === 0 && <Empty>Nothing added yet.</Empty>}
        </div>
      )}

      {(lines(prof?.skillsAcademic).length > 0 || lines(prof?.skillsPhysical).length > 0 || prof?.interests) && (
        <div className="card">
          <h3>🧩 Skills & About me</h3>
          {prof?.interests && <p className="sc-mini"><b>Interests:</b> {prof.interests}</p>}
          {prof?.careerGoals && <p className="sc-mini"><b>Career goals:</b> {prof.careerGoals}</p>}
          {prof?.learningGoals && <p className="sc-mini"><b>Learning goals:</b> {prof.learningGoals}</p>}
          {prof?.languages && <p className="sc-mini"><b>Languages:</b> {prof.languages}</p>}
          {prof?.strengths && <p className="sc-mini"><b>Strengths:</b> {prof.strengths}</p>}
          {prof?.preferredCoLearner && <p className="sc-mini"><b>Preferred co-learner:</b> {prof.preferredCoLearner}</p>}
          <div className="sc-grid">
            <span><b className="sc-mini">Academic skills</b><ul className="sc-list">{lines(prof?.skillsAcademic).map((x, i) => <li key={i}>{x}</li>)}</ul></span>
            <span><b className="sc-mini">Physical skills</b><ul className="sc-list">{lines(prof?.skillsPhysical).map((x, i) => <li key={i}>{x}</li>)}</ul></span>
          </div>
        </div>
      )}

      {isStudent && (
        <div className="card">
          <h3>📈 Learning progress</h3>
          <div className="sc-kv"><span>Current courses</span><b>{current.length}</b></div>
          <div className="sc-kv"><span>Completed courses</span><b>{done.length}</b></div>
          {current.map((c) => (
            <div key={c.id} className="sc-kv">
              <span>{c.title}</span>
              <span className="sc-rowbtns">
                <Bar pct={c.progress} />
                {isMe && (
                  <>
                    <button className="btn like" type="button" onClick={() => void setCourseProgress(c, c.progress + 10)}>+10%</button>
                    <button className="btn like" type="button" onClick={() => void toggleCourseDone(c)}>Complete</button>
                  </>
                )}
              </span>
            </div>
          ))}
          {isMe && (
            <CourseAdd onAdd={(t) => { void addCourse(me.uid, t); notify("Course added"); }} />
          )}
          <h4>🎯 Upcoming learning goals</h4>
          {upcoming.map((g) => (
            <div key={g.id} className="sc-kv">
              <span>{g.title} <span className="sc-mini">(by {g.due || "—"})</span></span>
              {isMe && <button className="btn like" type="button" onClick={() => void toggleGoal(g)}>✓ Done</button>}
            </div>
          ))}
          {upcoming.length === 0 && <Empty>No upcoming goals.</Empty>}
          {isMe && <GoalAdd onAdd={(t, d) => { void addGoal(me.uid, t, d); notify("Goal added"); }} />}
          <h4>🕒 Progress timeline</h4>
          <ul className="sc-list">
            {[...myCourses].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8).map((c) => (
              <li key={c.id}>{timeAgo(c.updatedAt)} — {c.title} ({c.status}, {c.progress}%)</li>
            ))}
          </ul>
        </div>
      )}

      {isStudent && suggestions.length > 0 && (
        <div className="card">
          <h3>🤝 Suggested co-learners & mentors</h3>
          <div className="sc-actions">
            {suggestions.map(({ u, same }) => (
              <button key={u.uid} className="sc-chip" type="button" onClick={() => { window.location.hash = ""; notify(`Open ${u.name}'s profile from Student Social → their post → View profile`); }}>
                {u.name}{same ? " · same class" : ""}
              </button>
            ))}
          </div>
          <p className="sc-mini">Matching uses your class, interests, goals and strengths (About me) — open Student Social → any profile → Message to connect.</p>
        </div>
      )}

      <div className="card">
        <h3>🗂 Portfolio</h3>
        {isStudent
          ? (myProjects.length
            ? <ul className="sc-list">{myProjects.map((p) => <li key={p.id}><b>{p.title}</b>{p.link ? <> — <a href={p.link} target="_blank" rel="noopener noreferrer">open</a></> : null}</li>)}</ul>
            : <Empty>No projects uploaded yet.</Empty>)
          : (myPosts.filter((p) => p.kind === "Portfolio").length
            ? <ul className="sc-list">{myPosts.filter((p) => p.kind === "Portfolio").map((p) => <li key={p.id}><b>{p.title}</b></li>)}</ul>
            : <Empty>Portfolio posts appear here (post one from Faculty Social → kind "Portfolio").</Empty>)}
      </div>

      <div className="card">
        <h3>📰 Posts by {prof?.name ?? me.name} ({myPosts.length})</h3>
        {myPosts.length === 0 && <Empty>No posts yet.</Empty>}
        {[...myPosts].sort((a, b) => b.createdAt - a.createdAt).slice(0, 10).map((p) => (
          <div key={p.id} className="sc-kv">
            <span><b>{p.title}</b> <span className="sc-mini">· {p.kind} · {timeAgo(p.createdAt)}</span></span>
            <span className="sc-mini">❤ {(p.likes ?? []).length} · ⭐ {(p.interested ?? []).length} · ↗ {p.shares ?? 0}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function CourseAdd({ onAdd }: { onAdd: (t: string) => void }): JSX.Element {
  const [t, setT] = useState("");
  return (
    <div className="sc-send">
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder="Add a course you're learning…" />
      <button className="btn primary" type="button" onClick={() => { if (t.trim()) { onAdd(t); setT(""); } }}>Add</button>
    </div>
  );
}
function GoalAdd({ onAdd }: { onAdd: (t: string, d: string) => void }): JSX.Element {
  const [t, setT] = useState("");
  const [d, setD] = useState("");
  return (
    <div className="sc-send">
      <input value={t} onChange={(e) => setT(e.target.value)} placeholder="New learning goal…" />
      <input type="date" value={d} onChange={(e) => setD(e.target.value)} style={{ maxWidth: 160 }} />
      <button className="btn primary" type="button" onClick={() => { if (t.trim()) { onAdd(t, d); setT(""); setD(""); } }}>Add</button>
    </div>
  );
}
