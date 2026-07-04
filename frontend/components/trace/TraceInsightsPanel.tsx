"use client";

import type { TraceInsight } from "@/lib/insights";

export function TraceInsightsPanel({
  insights,
  onSelectSpan,
}: {
  insights: TraceInsight[];
  onSelectSpan?: (spanId: string) => void;
}) {
  if (insights.length === 0) return null;

  return (
    <div className="trace-insights panel">
      <div className="panel-title">
        <span>Insights</span>
        <span className="hint">{insights.length} detected</span>
      </div>
      <div className="trace-insights-body">
        {insights.map((ins) => (
          <button
            key={ins.id}
            type="button"
            className={`insight-row insight-${ins.severity}${ins.spanId ? " clickable" : ""}`}
            onClick={() => ins.spanId && onSelectSpan?.(ins.spanId)}
            disabled={!ins.spanId}
          >
            <div className="insight-title">{ins.title}</div>
            <div className="insight-detail">{ins.detail}</div>
          </button>
        ))}
      </div>
    </div>
  );
}
