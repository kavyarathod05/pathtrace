import type { Span, Trace } from "./types";

export interface LayoutSpan {
  span: Span;
  depth: number;
  offsetUs: number; // start offset from trace start
  onCriticalPath: boolean;
}

export interface TraceLayout {
  rows: LayoutSpan[];
  startMs: number;
  totalUs: number;
}

// buildLayout orders spans as a depth-first tree and computes each span's
// offset from the trace start, plus which spans lie on the critical path
// (the chain of spans that determines the trace's end time).
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

  const rows: LayoutSpan[] = [];
  const walk = (parentId: string, depth: number) => {
    const list = children.get(parentId) ?? [];
    for (const s of list) {
      rows.push({
        span: s,
        depth,
        offsetUs: (new Date(s.startTime).getTime() - startMs) * 1000,
        onCriticalPath: false,
      });
      walk(s.spanId, depth + 1);
    }
  };
  walk("__root__", 0);

  markCriticalPath(rows, children);

  return { rows, startMs, totalUs };
}

// markCriticalPath walks from the root, always following the child whose end
// time is latest, approximating the span chain that drives total latency.
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
