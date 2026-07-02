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

// Muted, print-safe palette. Deliberately avoids saturated/neon tones.
const SERVICE_COLORS = [
  "#4c9a92", // teal
  "#c08a4a", // amber
  "#7d8bb0", // slate blue
  "#a86f8f", // mauve
  "#6b9a5a", // moss
  "#b0714f", // clay
  "#5f8faa", // steel
  "#9a8f5a", // olive
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
