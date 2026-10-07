// src/social/kit.tsx — shared atoms
import type { ReactNode } from "react";
import type { Profile, VType } from "./data";

export function Avatar({ name, photo, size = 44 }: { name: string; photo?: string; size?: number }): JSX.Element {
  const ch = (name || "?").trim().charAt(0).toUpperCase();
  return photo
    ? <img className="sc-ava" src={photo} alt={name} style={{ width: size, height: size }} />
    : <span className="sc-ava sc-ava-txt" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>{ch}</span>;
}

export function VBadge({ p }: { p?: Profile | null }): JSX.Element | null {
  if (!p?.verified || !p.verificationType) return null;
  const t: VType = p.verificationType;
  return t === "government"
    ? <span className="sc-badge gov" title="Government-verified faculty">🛡 Gov-verified</span>
    : <span className="sc-badge priv" title="Private-school verified faculty">✔ Verified</span>;
}

export function RoleChip({ role }: { role: string }): JSX.Element {
  return <span className="sc-badge role">{role === "teacher" ? "Faculty" : role.toUpperCase()}</span>;
}

export function Bar({ pct }: { pct: number }): JSX.Element {
  const v = Math.max(0, Math.min(100, Math.round(pct)));
  return <span className="sc-bar"><i style={{ width: `${v}%` }} /></span>;
}

export function Empty({ children }: { children: ReactNode }): JSX.Element {
  return <p className="sc-empty">{children}</p>;
}
