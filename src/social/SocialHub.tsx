// src/social/SocialHub.tsx — feed (posts + impressions), Sync, inbox/messages, profile routing
import { useEffect, useState } from "react";
import type { User } from "../firebase";
import { timeAgo } from "../ui";
import type { Notify } from "../views";
import { Avatar, RoleChip, VBadge, Empty } from "./kit";
import ChatBox from "./ChatBox";
import ProfilePage from "./ProfilePage";
import {
  useCol, createPost, toggleLike, markInterested, sharePost, addComment,
  POST_KINDS, getUserDoc, type PostDoc, type CommentDoc, type InboxDoc, type NotifDoc, type Profile,
} from "./data";
import "./social.css";

type View = { t: "feed" } | { t: "inbox" } | { t: "chat"; uid: string } | { t: "profile"; uid: string };

export default function SocialHub({ me, notify }: { me: User; notify: Notify }): JSX.Element {
  const [view, setView] = useState<View>({ t: "feed" });
  const posts = useCol<PostDoc>("posts").slice().sort((a, b) => b.createdAt - a.createdAt);
  const inbox = useCol<InboxDoc>("inbox", ["uid", me.uid]).slice().sort((a, b) => b.at - a.at);
  const [unread, setUnread] = useState(0);

  useEffect(() => {
    let dead = false;
    const tick = (): void => {
      void import("../firebase").then(async (fb) => {
        const rows = await fb.list<NotifDoc>("notifications", ["toUid", me.uid]).catch(() => []);
        if (!dead) setUnread((rows ?? []).filter((n) => !n.read).length);
      });
    };
    tick();
    const iv = window.setInterval(tick, 15000);
    return () => { dead = true; clearInterval(iv); };
  }, [me.uid]);

  const clearNotifs = async (): Promise<void> => {
    const fb = await import("../firebase");
    const rows = await fb.list<NotifDoc>("notifications", ["toUid", me.uid]).catch(() => []);
    for (const n of (rows ?? []).filter((x) => !x.read).slice(0, 30)) {
      await fb.update("notifications", n.id, { read: true });
    }
    setUnread(0);
    notify("Notifications cleared");
  };

  return (
    <>
      <div className="tabs">
        <button type="button" className={`tab${view.t === "feed" ? " on" : ""}`} onClick={() => setView({ t: "feed" })}>📰 Feed</button>
        <button type="button" className={`tab${view.t === "inbox" ? " on" : ""}`} onClick={() => setView({ t: "inbox" })}>💬 Inbox{unread > 0 ? ` (${unread})` : ""}</button>
        <button type="button" className={`tab${view.t === "profile" && view.uid === me.uid ? " on" : ""}`} onClick={() => setView({ t: "profile", uid: me.uid })}>👤 My profile</button>
        {unread > 0 && <button className="btn like" type="button" onClick={() => void clearNotifs()}>🔔 {unread} — mark read</button>}
      </div>

      {view.t === "feed" && (
        <>
          <Composer me={me} notify={notify} />
          {posts.length === 0 && <Empty>No posts yet — share the first achievement!</Empty>}
          {posts.map((p) => (
            <PostCard key={p.id} post={p} me={me} notify={notify}
              onView={(uid) => setView({ t: "profile", uid })} />
          ))}
        </>
      )}

      {view.t === "inbox" && (
        <div className="card">
          <h3>💬 Messages</h3>
          {inbox.length === 0 && <Empty>No conversations yet — open a profile and tap Message.</Empty>}
          {inbox.map((c) => (
            <button key={c.id} type="button" className="sc-thread" onClick={() => setView({ t: "chat", uid: c.withUid })}>
              <Avatar name={c.withName} size={34} />
              <span style={{ flex: 1, minWidth: 0 }}>
                <b>{c.withName}</b>
                <small className="sc-mini" style={{ display: "block" }}>{c.last}</small>
              </span>
              <small className="sc-mini">{timeAgo(c.at)}</small>
            </button>
          ))}
        </div>
      )}

      {view.t === "chat" && <ChatTarget me={me} notify={notify} uid={view.uid} onBack={() => setView({ t: "inbox" })} />}
      {view.t === "profile" && <ProfilePage me={me} notify={notify} uid={view.uid} onBack={() => setView({ t: "feed" })} />}
    </>
  );
}

function ChatTarget({ me, notify, uid, onBack }: { me: User; notify: Notify; uid: string; onBack: () => void }): JSX.Element {
  const [other, setOther] = useState<User | null>(null);
  useEffect(() => { void getUserDoc(uid).then(setOther); }, [uid]);
  if (!other) return <Empty>Loading…</Empty>;
  return <ChatBox me={me} other={other} notify={notify} onBack={onBack} />;
}

function Composer({ me, notify }: { me: User; notify: Notify }): JSX.Element {
  const [kind, setKind] = useState<string>(POST_KINDS[0]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [img, setImg] = useState("");
  const pick = (e: React.ChangeEvent<HTMLInputElement>): void => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400 * 1024) { notify("Image too large — keep under 400 KB", "error"); return; }
    const r = new FileReader();
    r.onload = () => setImg(String(r.result));
    r.readAsDataURL(file);
  };
  const post = async (): Promise<void> => {
    if (!title.trim() && !body.trim()) { notify("Write something first", "error"); return; }
    await createPost(me, kind, title || body.slice(0, 40), body, img || undefined);
    setTitle(""); setBody(""); setImg("");
    notify("Posted to the network ⚡");
  };
  return (
    <div className="card">
      <h3>✍ Upload a post</h3>
      <div className="sc-form">
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {POST_KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Title (e.g., My students won district science fair)" />
        <textarea rows={3} value={body} onChange={(e) => setBody(e.target.value)} placeholder="Share the story, idea or achievement…" />
        <input type="file" accept="image/*" onChange={pick} />
        {img && <img className="sc-post-img" src={img} alt="preview" />}
        <button className="btn primary" type="button" onClick={() => void post()}>Post</button>
      </div>
    </div>
  );
}

function PostCard({ post, me, notify, onView }: {
  post: PostDoc; me: User; notify: Notify; onView: (uid: string) => void;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const cmts = useCol<CommentDoc>("postComments", ["postId", post.id]).slice().sort((a, b) => a.createdAt - b.createdAt);
  const liked = (post.likes ?? []).includes(me.uid);
  const starred = (post.interested ?? []).includes(me.uid);
  return (
    <div className="card">
      <div className="phead">
        <button type="button" className="sc-author" onClick={() => onView(post.authorUid)}>
          <Avatar name={post.authorName} size={34} />
        </button>
        <b>{post.authorName}</b><RoleChip role={post.authorRole} />
        <span className="sc-badge kind">{post.kind}</span>
        <span className="sc-mini">{timeAgo(post.createdAt)}</span>
      </div>
      <h3 style={{ marginTop: 6 }}>{post.title}</h3>
      {post.body && <p>{post.body}</p>}
      {post.image && <img className="sc-post-img" src={post.image} alt="" />}
      <div className="sc-imp">
        <button className={`sc-chip${liked ? " on" : ""}`} type="button"
          onClick={() => void toggleLike(post, me.uid)}>❤ {post.likes?.length ?? 0}</button>
        <button className={`sc-chip${starred ? " on" : ""}`} type="button"
          onClick={() => { void markInterested(post, me); if (!starred) notify("⭐ Interested — the author can now connect with you"); }}>
          ⭐ Interested {post.interested?.length ?? 0}
        </button>
        <button className="sc-chip" type="button" onClick={() => setOpen(!open)}>💬 {cmts.length}</button>
        <button className="sc-chip" type="button" onClick={() => { void sharePost(post, me); notify("Link copied · author notified"); }}>↗ {post.shares ?? 0}</button>
        <button className="sc-chip" type="button" onClick={() => onView(post.authorUid)}>View profile</button>
      </div>
      {open && (
        <>
          <div className="sc-chat">
            {cmts.length === 0 && <p className="sc-empty">No comments yet.</p>}
            {cmts.map((c) => (
              <div key={c.id} className={`sc-msg${c.authorUid === me.uid ? " mine" : ""}`}>
                <span>{c.text}</span><small>{c.authorName}</small>
              </div>
            ))}
          </div>
          <div className="sc-send">
            <input value={text} onChange={(e) => setText(e.target.value)} placeholder="Ask, appreciate or share an idea…"
              onKeyDown={(e) => { if (e.key === "Enter" && text.trim()) { void addComment(post, me, text); setText(""); } }} />
            <button className="btn primary" type="button" onClick={() => { if (text.trim()) { void addComment(post, me, text); setText(""); } }}>Send</button>
          </div>
        </>
      )}
    </div>
  );
}
