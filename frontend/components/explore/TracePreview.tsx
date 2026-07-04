"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchTrace } from "@/lib/api";
import { formatDuration, serviceColor } from "@/lib/format";
import { computeTraceInsights } from "@/lib/insights";
import { buildLayout } from "@/lib/trace";
import type { Trace, TraceSummary } from "@/lib/types";
import { MiniTimeline } from "./MiniTimeline";

interface TracePreviewProps {
  project: string;
  summary: TraceSummary | null;
  onSelectSpan?: (spanId: string) => void;
}

export function TracePreview({ project, summary, onSelectSpan }: TracePreviewProps) {
  const [trace, setTrace] = useState<Trace | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!summary) {
      setTrace(null);
      return;
    }
    let active = true;
    setLoading(true);
    setError(null);
    fetchTrace(project, summary.traceId)
      .then((t) => active && setTrace(t))
      .catch((e) => active && setError(String(e)))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [project, summary?.traceId]);

  const layout = useMemo(() => (trace ? buildLayout(trace) : null), [trace]);
  const insights = useMemo(() => (trace ? computeTraceInsights(trace) : []), [trace]);

  if (!summary) {
    return (
      <aside className="trace-preview trace-preview-empty">
        <div className="section-label">Preview</div>
        <div className="empty">
          <div className="big">Select a trace</div>
          Click a trace in the list to preview its timeline and insights.
        </div>
      </aside>
    );
  }

  return (
    <aside className="trace-preview">
      <div className="trace-preview-head">
        <div>
          <div className="section-label">Preview</div>
          <div className="trace-preview-title">
            <span className="swatch" style={{ background: serviceColor(summary.rootService) }} />
            {summary.rootOperation}
          </div>
        </div>
        <Link href={`/traces/${summary.traceId}`} className="btn sm">
          Open trace
        </Link>
      </div>

      <div className="trace-preview-stats">
        <div><span className="k">Duration</span><span className="v">{formatDuration(summary.durationUs)}</span></div>
        <div><span className="k">Spans</span><span className="v">{summary.spanCount}</span></div>
        <div><span className="k">Services</span><span className="v">{summary.services.length}</span></div>
        <div><span className="k">Errors</span><span className={`v${summary.errorCount ? " err" : ""}`}>{summary.errorCount}</span></div>
      </div>

      {loading && <div className="skeleton" style={{ height: 120, marginBottom: 12 }} />}
      {error && <div className="err-note" style={{ marginBottom: 12 }}>{error}</div>}

      {!loading && layout && (
        <>
          <div className="preview-lane-wrap">
            <div className="section-label">Service timeline</div>
            <MiniTimeline summary={summary} height={10} />
            <div className="preview-lanes">
              {[...new Set(trace!.spans.map((s) => s.serviceName))].map((svc) => {
                const rows = layout.rows.filter((r) => r.span.serviceName === svc);
                const totalUs = summary.durationUs;
                return (
                  <div key={svc} className="preview-lane">
                    <div className="preview-lane-label">
                      <span className="swatch" style={{ background: serviceColor(svc) }} />
                      {svc}
                    </div>
                    <div className="preview-lane-track">
                      {rows.map((r) => {
                        const left = ((r.offsetUs / totalUs) * 100);
                        const width = Math.max(2, (r.span.durationUs / totalUs) * 100);
                        const err = r.span.statusCode === "ERROR";
                        return (
                          <button
                            key={r.span.spanId}
                            type="button"
                            className={`preview-lane-bar${err ? " err" : ""}`}
                            style={{
                              left: `${left}%`,
                              width: `${width}%`,
                              background: serviceColor(svc),
                            }}
                            title={`${r.span.operationName} · ${formatDuration(r.span.durationUs)}`}
                            onClick={() => onSelectSpan?.(r.span.spanId)}
                          />
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {insights.length > 0 && (
            <div className="preview-insights">
              <div className="section-label">Insights</div>
              {insights.map((ins) => (
                <div key={ins.id} className={`insight-row insight-${ins.severity}`}>
                  <div className="insight-title">{ins.title}</div>
                  <div className="insight-detail">{ins.detail}</div>
                </div>
              ))}
            </div>
          )}

          <div className="preview-spans">
            <div className="section-label">Spans ({trace!.spans.length})</div>
            <div className="preview-span-list">
              {layout.rows.slice(0, 12).map((r) => (
                <button
                  key={r.span.spanId}
                  type="button"
                  className="preview-span-row"
                  onClick={() => onSelectSpan?.(r.span.spanId)}
                >
                  <span className="swatch" style={{ background: serviceColor(r.span.serviceName) }} />
                  <span className="op">{r.span.operationName}</span>
                  <code>{formatDuration(r.span.durationUs)}</code>
                </button>
              ))}
              {layout.rows.length > 12 && (
                <Link href={`/traces/${summary.traceId}`} className="link preview-more">
                  +{layout.rows.length - 12} more spans
                </Link>
              )}
            </div>
          </div>
        </>
      )}
    </aside>
  );
}
