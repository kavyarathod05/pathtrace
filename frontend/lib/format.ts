// Formatting helpers for durations, timestamps, and consistent per-service
// colors. Colors are drawn from a fixed, muted palette (no neon) so the same
// service always renders with the same hue across every screen.

export function formatDuration(us: number): string {
  if (us < 1000) return `${us.toFixed(0)}µs`;
  const ms = us / 1000;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 2 : 1)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

export function formatTimeAgo(iso: string): string {
  const then = new Date(iso).getTime();
  const diff = Date.now() - then;
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function formatClock(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString(undefined, {
    hour12: false,
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function formatPercent(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

// Bright palette for light backgrounds.
const SERVICE_COLORS = [
  "#0ea5a0",
  "#6366f1",
  "#e8910a",
  "#e34935",
  "#22a06b",
  "#4a7fd4",
  "#a855f7",
  "#0891b2",
];

const cache = new Map<string, string>();

export function serviceColor(service: string): string {
  const existing = cache.get(service);
  if (existing) return existing;
  let hash = 0;
  for (let i = 0; i < service.length; i++) {
    hash = (hash * 31 + service.charCodeAt(i)) >>> 0;
  }
  const color = SERVICE_COLORS[hash % SERVICE_COLORS.length];
  cache.set(service, color);
  return color;
}

export function shortId(id: string, len = 8): string {
  return id.length > len ? id.slice(0, len) : id;
}
