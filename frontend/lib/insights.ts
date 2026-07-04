import type { Span, Trace, TraceSummary } from "./types";
import { buildLayout, type LayoutSpan } from "./trace";

export interface TraceInsight {
  id: string;
  severity: "info" | "warn" | "error";
  title: string;
  detail: string;
  spanId?: string;
}

export function computeTraceInsights(trace: Trace): TraceInsight[] {
  const insights: TraceInsight[] = [];
  const layout = buildLayout(trace);
  const s = trace.summary;

  if (s.errorCount > 0) {
    const errSpan = trace.spans.find((sp) => sp.statusCode === "ERROR");
    insights.push({
      id: "errors",
      severity: "error",
      title: `${s.errorCount} error span${s.errorCount > 1 ? "s" : ""}`,
      detail: errSpan
        ? `${errSpan.serviceName} · ${errSpan.operationName}${errSpan.statusMessage ? `: ${errSpan.statusMessage}` : ""}`
        : "One or more spans reported ERROR status",
      spanId: errSpan?.spanId,
    });
  }

  const critical = layout.rows.filter((r) => r.onCriticalPath);
  if (critical.length > 0) {
    const slowest = critical.reduce((a, b) =>
      a.span.durationUs >= b.span.durationUs ? a : b,
    );
    insights.push({
      id: "critical-path",
      severity: "info",
      title: "Critical path",
      detail: `${critical.length} spans · slowest ${slowest.span.serviceName} · ${slowest.span.operationName}`,
      spanId: slowest.span.spanId,
    });
  }

  const byService = new Map<string, number>();
  for (const sp of trace.spans) {
    byService.set(sp.serviceName, (byService.get(sp.serviceName) ?? 0) + sp.durationUs);
  }
  let topSvc = "";
  let topUs = 0;
  for (const [svc, us] of byService) {
    if (us > topUs) {
      topUs = us;
      topSvc = svc;
    }
  }
  if (topSvc) {
    const pct = Math.round((topUs / s.durationUs) * 100);
    insights.push({
      id: "top-service",
      severity: pct > 60 ? "warn" : "info",
      title: "Top time consumer",
      detail: `${topSvc} accounts for ~${pct}% of trace duration`,
    });
  }

  const gaps = layout.rows.filter((r) => r.gapBeforeUs > 50_000);
  if (gaps.length > 0) {
    const biggest = gaps.reduce((a, b) => (a.gapBeforeUs >= b.gapBeforeUs ? a : b));
    insights.push({
      id: "gaps",
      severity: "warn",
      title: "Scheduling gaps detected",
      detail: `${gaps.length} span${gaps.length > 1 ? "s" : ""} with idle time before start (max ${Math.round(biggest.gapBeforeUs / 1000)}ms)`,
      spanId: biggest.span.spanId,
    });
  }

  if (s.services.length >= 4) {
    insights.push({
      id: "fan-out",
      severity: "info",
      title: "Multi-service trace",
      detail: `${s.services.length} services · ${s.spanCount} spans`,
    });
  }

  return insights;
}

/** Build mini-timeline segments for trace list cards from summary + optional full trace. */
export function miniTimelineSegments(
  summary: TraceSummary,
  spans?: Span[],
): { service: string; left: number; width: number; error: boolean }[] {
  if (spans && spans.length > 0) {
    const startMs = Math.min(...spans.map((s) => new Date(s.startTime).getTime()));
    const totalUs = Math.max(1, summary.durationUs);
    return spans
      .slice()
      .sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime())
      .slice(0, 24)
      .map((s) => {
        const offsetUs = (new Date(s.startTime).getTime() - startMs) * 1000;
        return {
          service: s.serviceName,
          left: (offsetUs / totalUs) * 100,
          width: Math.max(1.5, (s.durationUs / totalUs) * 100),
          error: s.statusCode === "ERROR",
        };
      });
  }

  const n = summary.services.length;
  const slice = 100 / Math.max(1, n);
  return summary.services.map((service, i) => ({
    service,
    left: i * slice,
    width: slice * 0.85,
    error: summary.errorCount > 0 && i === n - 1,
  }));
}

export function serviceLanesFromLayout(rows: LayoutSpan[]): Map<string, LayoutSpan[]> {
  const lanes = new Map<string, LayoutSpan[]>();
  for (const row of rows) {
    const svc = row.span.serviceName;
    if (!lanes.has(svc)) lanes.set(svc, []);
    lanes.get(svc)!.push(row);
  }
  return lanes;
}
