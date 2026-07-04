"use client";

import { formatDuration, serviceColor } from "@/lib/format";
import { miniTimelineSegments } from "@/lib/insights";
import type { TraceSummary } from "@/lib/types";

export function MiniTimeline({
  summary,
  height = 6,
}: {
  summary: TraceSummary;
  height?: number;
}) {
  const segments = miniTimelineSegments(summary);
  return (
    <div className="mini-timeline" style={{ height }} aria-hidden>
      {segments.map((seg, i) => (
        <span
          key={`${seg.service}-${i}`}
          className={`mini-timeline-seg${seg.error ? " err" : ""}`}
          style={{
            left: `${seg.left}%`,
            width: `${seg.width}%`,
            background: serviceColor(seg.service),
          }}
          title={`${seg.service}${seg.error ? " · error" : ""}`}
        />
      ))}
    </div>
  );
}

export function MiniTimelineLegend({ services }: { services: string[] }) {
  const shown = services.slice(0, 6);
  return (
    <div className="mini-timeline-legend">
      {shown.map((s) => (
        <span key={s} className="svc-tag" style={{ fontSize: 10 }}>
          <span className="swatch" style={{ background: serviceColor(s), width: 7, height: 7 }} />
          {s}
        </span>
      ))}
      {services.length > 6 && (
        <span className="hint">+{services.length - 6}</span>
      )}
    </div>
  );
}
