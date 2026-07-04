import type { Hotspot, ServiceHealth, TimeSeriesPoint } from "./types";
import { formatDuration, formatPercent } from "./format";

export function stepFor(win: string): string {
  switch (win) {
    case "15m":
      return "1m";
    case "1h":
      return "1m";
    case "6h":
      return "5m";
    case "24h":
      return "30m";
    default:
      return "1m";
  }
}

export function windowLabel(win: string): string {
  return `last ${win}`;
}

export interface AggregatedKPIs {
  requestRate: number;
  errorRate: number;
  p95Us: number;
  p99Us: number;
}

export function aggregateHealth(services: ServiceHealth[]): AggregatedKPIs {
  if (services.length === 0) {
    return { requestRate: 0, errorRate: 0, p95Us: 0, p99Us: 0 };
  }
  const totalSpans = services.reduce((a, s) => a + s.spanCount, 0);
  const requestRate = services.reduce((a, s) => a + s.throughputPerMin, 0);
  const errorRate = totalSpans
    ? services.reduce((a, s) => a + s.errorCount, 0) / totalSpans
    : 0;
  const p95Us = totalSpans
    ? services.reduce((a, s) => a + s.p95Us * s.spanCount, 0) / totalSpans
    : 0;
  const p99Us = totalSpans
    ? services.reduce((a, s) => a + s.p99Us * s.spanCount, 0) / totalSpans
    : 0;
  return { requestRate, errorRate, p95Us, p99Us };
}

export function impactScore(h: ServiceHealth): number {
  return h.errorRate * h.throughputPerMin + (h.p95Us / 1_000_000) * h.throughputPerMin * 0.1;
}

export type InsightStatus = "healthy" | "degraded" | "critical";

export interface Insight {
  status: InsightStatus;
  message: string;
  service?: string;
  operation?: string;
}

export function computeInsight(
  health: ServiceHealth[],
  hotspots: Hotspot[],
  win: string,
  red?: TimeSeriesPoint[] | null,
): Insight {
  const w = windowLabel(win);

  const criticalSvc = [...health]
    .sort((a, b) => b.errorRate - a.errorRate)
    .find((s) => s.errorRate > 0.05);
  if (criticalSvc) {
    const hot = hotspots.find((h) => h.service === criticalSvc.service);
    const op = hot?.operation;
    const msg = op
      ? `${criticalSvc.service} error rate at ${formatPercent(criticalSvc.errorRate)} — ${op} is the top failing operation`
      : `${criticalSvc.service} error rate elevated at ${formatPercent(criticalSvc.errorRate)}`;
    return { status: "critical", message: msg, service: criticalSvc.service, operation: op };
  }

  if (hotspots.length > 0 && hotspots[0].errorRate > 0.01) {
    const h = hotspots[0];
    return {
      status: "critical",
      message: `${h.service}/${h.operation} failing — ${formatPercent(h.errorRate)} error rate`,
      service: h.service,
      operation: h.operation,
    };
  }

  if (red && red.length >= 4) {
    const p95Delta = seriesDelta(red, (p) => p.p95Us);
    const focus = pickFocusService(health, hotspots);
    if (p95Delta !== null && p95Delta > 25 && focus) {
      return {
        status: "degraded",
        message: `${focus} latency increased ${Math.round(p95Delta)}% in the ${w}`,
        service: focus,
      };
    }
  }

  const slow = [...health]
    .sort((a, b) => b.p95Us - a.p95Us)
    .find((s) => s.p95Us > 400_000);
  if (slow) {
    return {
      status: "degraded",
      message: `${slow.service} latency is high — p95 ${formatDuration(slow.p95Us)}`,
      service: slow.service,
    };
  }

  const errSvc = [...health].sort((a, b) => b.errorRate - a.errorRate).find((s) => s.errorRate > 0.01);
  if (errSvc) {
    return {
      status: "degraded",
      message: `${errSvc.service} error rate at ${formatPercent(errSvc.errorRate)}`,
      service: errSvc.service,
    };
  }

  return { status: "healthy", message: `System healthy — no anomalies detected in the ${w}` };
}

export function pickFocusService(health: ServiceHealth[], hotspots: Hotspot[]): string | undefined {
  if (hotspots.length > 0) return hotspots[0].service;
  if (health.length === 0) return undefined;
  const byImpact = [...health].sort((a, b) => impactScore(b) - impactScore(a));
  return byImpact[0]?.service;
}

export function seriesDelta(
  points: TimeSeriesPoint[],
  getter: (p: TimeSeriesPoint) => number,
): number | null {
  if (points.length < 2) return null;
  const mid = Math.floor(points.length / 2);
  const first = points.slice(0, mid);
  const second = points.slice(mid);
  const avg = (pts: TimeSeriesPoint[]) =>
    pts.reduce((a, p) => a + getter(p), 0) / Math.max(1, pts.length);
  const a = avg(first);
  const b = avg(second);
  if (a === 0) return b > 0 ? 100 : 0;
  return ((b - a) / a) * 100;
}

export function bucketErrorRate(p: TimeSeriesPoint): number {
  return p.count ? p.errorCount / p.count : 0;
}

export function topFailing(health: ServiceHealth[], limit = 3): ServiceHealth[] {
  return [...health].sort((a, b) => b.errorRate - a.errorRate).slice(0, limit);
}

export function topSlow(health: ServiceHealth[], limit = 3): ServiceHealth[] {
  return [...health].sort((a, b) => b.p95Us - a.p95Us).slice(0, limit);
}

export function topImpact(health: ServiceHealth[], limit = 3): ServiceHealth[] {
  return [...health].sort((a, b) => impactScore(b) - impactScore(a)).slice(0, limit);
}

export function maxImpact(health: ServiceHealth[]): number {
  if (health.length === 0) return 1;
  return Math.max(1, ...health.map(impactScore));
}
