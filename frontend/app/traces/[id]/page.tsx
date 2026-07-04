"use client";

import Link from "next/link";
import { use, useEffect, useMemo, useState } from "react";
import { fetchTrace } from "@/lib/api";
import { useProject } from "@/lib/project";
import type { Span, Trace } from "@/lib/types";
import { buildLayout } from "@/lib/trace";
import { computeTraceInsights } from "@/lib/insights";
import { formatDuration, serviceColor } from "@/lib/format";
import { Waterfall } from "@/components/Waterfall";
import { ServiceLaneWaterfall } from "@/components/trace/ServiceLaneWaterfall";
import { TraceInsightsPanel } from "@/components/trace/TraceInsightsPanel";
import { PageHeader } from "@/components/shell/PageHeader";

type ViewMode = "tree" | "lanes";

export default function TracePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { project } = useProject();
  const [trace, setTrace] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Span | null>(null);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [viewMode, setViewMode] = useState<ViewMode>("tree");

  useEffect(() => {
    fetchTrace(project, id)
      .then((t) => {
        setTrace(t);
        setSelected(t.spans[0] ?? null);
      })
      .catch((e) => setError(String(e)));
  }, [id, project]);

  const layout = useMemo(() => (trace ? buildLayout(trace) : null), [trace]);
  const insights = useMemo(() => (trace ? computeTraceInsights(trace) : []), [trace]);

  const childrenOf = useMemo(() => {
    const m = new Map<string, string[]>();
    if (!layout) return m;
    for (const r of layout.rows) {
      const pid = r.span.parentSpanId || "__root__";
      if (!m.has(pid)) m.set(pid, []);
      m.get(pid)!.push(r.span.spanId);
    }
    return m;
  }, [layout]);

  const toggle = (spanId: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(spanId)) next.delete(spanId);
      else next.add(spanId);
      return next;
    });
  };

  const selectSpanById = (spanId: string) => {
    const span = trace?.spans.find((s) => s.spanId === spanId);
    if (span) setSelected(span);
  };

  if (error) {
    return (
      <div className="page-body">
        <div className="err-note">{error}</div>
        <p style={{ marginTop: 16 }}><Link href="/explore" className="link">← Back to Explore</Link></p>
      </div>
    );
  }
  if (!trace || !layout) {
    return (
      <div className="page-body">
        <div className="skeleton" style={{ height: 120, marginBottom: 16 }} />
        <div className="skeleton" style={{ height: 420 }} />
      </div>
    );
  }

  const s = trace.summary;

  return (
    <>
      <PageHeader
        title={
          <>
            <span className="svc-tag" style={{ fontSize: 16 }}>
              <span className="swatch" style={{ width: 10, height: 10, background: serviceColor(s.rootService) }} />
              {s.rootService}
            </span>{" "}
            <span style={{ color: "var(--text-dim)", fontWeight: 450 }}>{s.rootOperation}</span>
          </>
        }
        subtitle={<code>{trace.traceId}</code>}
        actions={
          <div className="seg trace-view-toggle">
            <button type="button" className={viewMode === "tree" ? "on" : ""} onClick={() => setViewMode("tree")}>
              Tree
            </button>
            <button type="button" className={viewMode === "lanes" ? "on" : ""} onClick={() => setViewMode("lanes")}>
              Service lanes
            </button>
          </div>
        }
      />

      <div className="page-body">
        <div className="stat-strip" style={{ marginBottom: 18 }}>
          <div className="stat"><div className="k">Duration</div><div className="v accent">{formatDuration(s.durationUs)}</div></div>
          <div className="stat"><div className="k">Spans</div><div className="v">{s.spanCount}</div></div>
          <div className="stat"><div className="k">Services</div><div className="v">{s.services.length}</div></div>
          <div className="stat"><div className="k">Errors</div><div className={`v${s.errorCount ? " err" : ""}`}>{s.errorCount}</div></div>
        </div>

        <div className="toprow">
          <Link href="/explore" className="btn ghost" style={{ height: 30, padding: "0 12px" }}>← Explore</Link>
          <span className="hint">Click a span to inspect · collapse branches with ▾ · Ctrl+scroll to zoom</span>
        </div>

        <div className="trace-detail-layout">
          <div className="trace-detail-main">
            {viewMode === "tree" ? (
              <Waterfall
                layout={layout}
                selectedId={selected?.spanId}
                onSelect={setSelected}
                collapsed={collapsed}
                onToggle={toggle}
                childrenOf={childrenOf}
              />
            ) : (
              <ServiceLaneWaterfall
                layout={layout}
                selectedId={selected?.spanId}
                onSelect={setSelected}
              />
            )}
          </div>

          <div className="trace-detail-side">
            <TraceInsightsPanel insights={insights} onSelectSpan={selectSpanById} />
            <SpanDetail span={selected} />
          </div>
        </div>
      </div>
    </>
  );
}

function SpanDetail({ span }: { span: Span | null }) {
  if (!span) {
    return (
      <div className="detail">
        <div className="dh hint">Select a span in the timeline</div>
      </div>
    );
  }
  const tagEntries = Object.entries(span.tags ?? {});
  const color = serviceColor(span.serviceName);

  return (
    <div className="detail">
      <div className="dh">
        <div className="svc-tag" style={{ fontSize: 13, fontWeight: 600 }}>
          <span className="swatch" style={{ width: 10, height: 10, background: color }} />
          {span.operationName}
        </div>
        <div className="hint" style={{ marginTop: 5 }}>{span.serviceName}</div>
      </div>
      <div className="kv">
        <div className="k">Span ID</div><div className="v">{span.spanId}</div>
        <div className="k">Parent</div><div className="v">{span.parentSpanId || "—"}</div>
        <div className="k">Kind</div><div className="v">{span.kind || "—"}</div>
        <div className="k">Duration</div><div className="v">{formatDuration(span.durationUs)}</div>
        <div className="k">Status</div>
        <div className="v">
          {span.statusCode === "ERROR"
            ? <span className="badge-err">{span.statusCode}{span.statusMessage ? `: ${span.statusMessage}` : ""}</span>
            : (span.statusCode || "unset")}
        </div>
      </div>

      {tagEntries.length > 0 && (
        <>
          <div className="sec">Attributes</div>
          <div className="kv">
            {tagEntries.map(([k, v]) => (
              <div key={k} style={{ display: "contents" }}>
                <div className="k">{k}</div>
                <div className="v">{String(v)}</div>
              </div>
            ))}
          </div>
        </>
      )}

      {span.events?.length > 0 && (
        <>
          <div className="sec">Events</div>
          <div className="kv">
            {span.events.map((e, i) => (
              <div key={i} style={{ display: "contents" }}>
                <div className="k">{e.name}</div>
                <div className="v">{JSON.stringify(e.attributes ?? {})}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
