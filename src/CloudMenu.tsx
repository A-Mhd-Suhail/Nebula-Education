import type { CSSProperties, ReactNode } from "react";

export interface CloudItem {
  key: string;
  label: string;
  sub: string;
  desc: string;
  icon: ReactNode;
  badge?: string;
}

/* small cloud = union of circles + a flat base (viewBox 200 x 120).
   Drawn twice: slightly larger in the outline colour, then in the fill colour on top. */
const SHAPES = (grow: number): JSX.Element => (
  <>
    <rect x={36 - grow} y={66 - grow} width={128 + grow * 2} height={40 + grow * 2} rx={20 + grow} />
    <circle cx="58" cy="72" r={26 + grow} />
    <circle cx="92" cy="52" r={34 + grow} />
    <circle cx="134" cy="58" r={28 + grow} />
    <circle cx="160" cy="80" r={22 + grow} />
  </>
);

/* the big "sky" cloud that holds all the small ones (stretches to fit) */
const SKY = (grow: number): JSX.Element => (
  <>
    <rect x={60 - grow} y={220 - grow} width={880 + grow * 2} height={340 + grow * 2} rx={150 + grow} />
    <circle cx="200" cy="350" r={170 + grow} />
    <circle cx="380" cy="235" r={170 + grow} />
    <circle cx="600" cy="205" r={190 + grow} />
    <circle cx="790" cy="255" r={175 + grow} />
    <circle cx="845" cy="385" r={150 + grow} />
  </>
);

interface Props {
  items: CloudItem[];
  onSelect: (key: string) => void;
}

export default function CloudMenu({ items, onSelect }: Props): JSX.Element {
  return (
    <div className="tc-sky">
      <svg className="tc-defs" width="0" height="0" aria-hidden="true" focusable="false">
        <defs>
          <linearGradient id="tcFill" gradientUnits="userSpaceOnUse" x1="0" y1="14" x2="0" y2="108">
            <stop offset="0" stopColor="#16396b" />
            <stop offset="1" stopColor="#081c3c" />
          </linearGradient>
        </defs>
      </svg>

      <svg className="tc-sky-bg" viewBox="0 0 1000 600" preserveAspectRatio="none" aria-hidden="true">
        <g className="tc-sky-out">{SKY(3)}</g>
        <g className="tc-sky-fill">{SKY(0)}</g>
      </svg>

      <nav className="tc-grid" aria-label="Teacher menu">
        {items.map((it, i) => (
          <button
            key={it.key}
            type="button"
            className="tc-cloud"
            title={it.desc}
            style={{ "--d": `${(i % 5) * 0.55}s`, "--i": i } as CSSProperties}
            onClick={() => onSelect(it.key)}
          >
            <svg className="tc-shape" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
              <g className="tc-out">{SHAPES(2.5)}</g>
              <g className="tc-fill">{SHAPES(0)}</g>
            </svg>
            <span className="tc-body">
              <span className="tc-ic">{it.icon}</span>
              <b>{it.label}</b>
              <small>{it.sub}</small>
            </span>
            {it.badge && <em className="tc-bd">{it.badge}</em>}
          </button>
        ))}
      </nav>
      <p className="tc-cap">Tap a cloud to open it · use ⌂ Home at the top to come back here</p>
    </div>
  );
}
