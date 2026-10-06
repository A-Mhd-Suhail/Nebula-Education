export const todayStr = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

export const timeAgo = (ts: number): string => {
  const m = Math.floor((Date.now() - (ts || 0)) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m}m ago`;
  if (m < 1440) return `${Math.floor(m / 60)}h ago`;
  return `${Math.floor(m / 1440)}d ago`;
};

export const stars = (n: number): string => {
  const v = Math.max(0, Math.min(5, Math.round(n)));
  return "★".repeat(v) + "☆".repeat(5 - v);
};
