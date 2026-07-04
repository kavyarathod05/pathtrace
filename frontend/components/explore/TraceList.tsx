"use client";

import { formatDuration, formatTimeAgo, serviceColor, shortId } from "@/lib/format";
import type { TraceSummary } from "@/lib/types";
import { MiniTimeline, MiniTimelineLegend } from "./MiniTimeline";

interface TraceListProps {
  traces: TraceSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onOpen: (id: string) => void;
  loading: boolean;
}

export function TraceList({ traces, selectedId, onSelect, onOpen, loading }: TraceListProps) {
  if (loading && traces.length === 0) {
    return (
      <div className="trace-list">
        <div className="skeleton" style={{ height: 88, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 88, marginBottom: 8 }} />
        <div className="skeleton" style={{ height: 88 }} />
      </div>
    );
  }

  if (traces.length === 0) {
    return (
      <div className="trace-list trace-list-empty">
        <div className="empty">
          <div className="big">No traces found</div>
          Adjust filters or widen the time range.
        </div>
      </div>
    );
  }

  return (
    <div className="trace-list">
      <div className="trace-list-head">
        <span>{traces.length} traces</span>
        <span className="hint">Click to preview · double-click to open</span>
      </div>
      {traces.map((t) => (
        <TraceCard
          key={t.traceId}
          trace={t}
          selected={selectedId === t.traceId}
          onSelect={() => onSelect(t.traceId)}
          onOpen={() => onOpen(t.traceId)}
        />
      ))}
    </div>
  );
}

function TraceCard({
  trace,
  selected,
  onSelect,
  onOpen,
}: {
  trace: TraceSummary;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  const err = trace.errorCount > 0;

  return (
    <article
      className={`trace-card${selected ? " selected" : ""}${err ? " has-error" : ""}`}
      onClick={onSelect}
      onDoubleClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter") onSelect();
      }}
    >
      <div className="trace-card-top">
        <div className="trace-card-root">
          <span className="swatch" style={{ background: serviceColor(trace.rootService) }} />
          <div>
            <div className="trace-card-op">{trace.rootOperation}</div>
            <div className="trace-card-svc">{trace.rootService}</div>
          </div>
        </div>
        <div className="trace-card-meta">
          <code>{formatDuration(trace.durationUs)}</code>
          {err && <span className="badge-err">{trace.errorCount}</span>}
        </div>
      </div>

      <MiniTimeline summary={trace} height={8} />
      <MiniTimelineLegend services={trace.services} />

      <div className="trace-card-foot">
        <code className="trace-id">{shortId(trace.traceId, 12)}</code>
        <span className="hint">{trace.spanCount} spans · {formatTimeAgo(trace.startTime)}</span>
      </div>
    </article>
  );
}
