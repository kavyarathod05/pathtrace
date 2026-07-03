import type { Span, Trace } from "./types";

export interface LayoutSpan {
  span: Span;
  depth: number;
  offsetUs: number;
  onCriticalPath: boolean;
  selfUs: number;
  gapBeforeUs: number;
}

export interface TraceLayout {
  rows: LayoutSpan[];
  startMs: number;
  totalUs: number;
}

export function buildLayout(trace: Trace): TraceLayout {
  const spans = trace.spans;
  if (spans.length === 0) return { rows: [], startMs: 0, totalUs: 0 };

  const byId = new Map<string, Span>();
  const children = new Map<string, Span[]>();
  for (const s of spans) byId.set(s.spanId, s);
  for (const s of spans) {
    const parent = s.parentSpanId && byId.has(s.parentSpanId) ? s.parentSpanId : "__root__";
    if (!children.has(parent)) children.set(parent, []);
    children.get(parent)!.push(s);
  }
  for (const list of children.values()) {
    list.sort((a, b) => new Date(a.startTime).getTime() - new Date(b.startTime).getTime());
  }

  const startMs = Math.min(...spans.map((s) => new Date(s.startTime).getTime()));
  const endMs = Math.max(
    ...spans.map((s) => new Date(s.startTime).getTime() + s.durationUs / 1000),
  );
  const totalUs = Math.max(1, (endMs - startMs) * 1000);

  const childDur = new Map<string, number>();
  for (const s of spans) {
    if (s.parentSpanId && byId.has(s.parentSpanId)) {
      childDur.set(s.parentSpanId, (childDur.get(s.parentSpanId) ?? 0) + s.durationUs);
    }
  }

  const rows: LayoutSpan[] = [];
  const walk = (parentId: string, depth: number, parentEndUs: number) => {
    const list = children.get(parentId) ?? [];
    for (const s of list) {
      const offsetUs = (new Date(s.startTime).getTime() - startMs) * 1000;
      const selfUs = Math.max(0, s.durationUs - (childDur.get(s.spanId) ?? 0));
      rows.push({
        span: s,
        depth,
        offsetUs,
        onCriticalPath: false,
        selfUs,
        gapBeforeUs: Math.max(0, offsetUs - parentEndUs),
      });
      walk(s.spanId, depth + 1, offsetUs + s.durationUs);
    }
  };
  walk("__root__", 0, 0);

  markCriticalPath(rows, children);
  return { rows, startMs, totalUs };
}

function markCriticalPath(rows: LayoutSpan[], children: Map<string, Span[]>) {
  const rowBySpan = new Map<string, LayoutSpan>();
  for (const r of rows) rowBySpan.set(r.span.spanId, r);

  const endOf = (s: Span) => new Date(s.startTime).getTime() + s.durationUs / 1000;
  const latest = (list: Span[]): Span => list.reduce((a, b) => (endOf(a) >= endOf(b) ? a : b));

  const roots = children.get("__root__") ?? [];
  if (roots.length === 0) return;
  let current: Span | undefined = latest(roots);

  while (current) {
    const row = rowBySpan.get(current.spanId);
    if (row) row.onCriticalPath = true;
    const kids: Span[] = children.get(current.spanId) ?? [];
    if (kids.length === 0) break;
    current = latest(kids);
  }
}

export function formatAxisTime(us: number): string {
  if (us < 1000) return `${us.toFixed(0)}µs`;
  const ms = us / 1000;
  if (ms < 1000) return `${ms.toFixed(ms < 10 ? 1 : 0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
