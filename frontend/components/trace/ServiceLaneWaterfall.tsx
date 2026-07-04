"use client";

import { useMemo, useState } from "react";
import type { Span } from "@/lib/types";
import { formatDuration, serviceColor } from "@/lib/format";
import { formatAxisTime, type TraceLayout } from "@/lib/trace";
import { serviceLanesFromLayout } from "@/lib/insights";

interface ServiceLaneWaterfallProps {
  layout: TraceLayout;
  selectedId?: string;
  onSelect: (span: Span) => void;
}

export function ServiceLaneWaterfall({ layout, selectedId, onSelect }: ServiceLaneWaterfallProps) {
  const lanes = useMemo(() => serviceLanesFromLayout(layout.rows), [layout]);
  const services = useMemo(() => [...lanes.keys()].sort(), [lanes]);
  const [hoverSvc, setHoverSvc] = useState<string | null>(null);

  const toPct = (offsetUs: number, durUs: number) => ({
    left: (offsetUs / layout.totalUs) * 100,
    width: Math.max(0.5, (durUs / layout.totalUs) * 100),
  });

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="lane-wf panel">
      <div className="panel-title">
        <span>Service lanes</span>
        <span className="hint">{services.length} services · grouped by service</span>
      </div>

      <div className="lane-wf-axis">
        {ticks.map((t) => (
          <div key={t} className="lane-wf-tick" style={{ left: `${t * 100}%` }}>
            <span>{formatAxisTime(layout.totalUs * t)}</span>
          </div>
        ))}
      </div>

      <div className="lane-wf-body">
        {services.map((svc) => {
          const rows = lanes.get(svc) ?? [];
          const dim = hoverSvc && hoverSvc !== svc;
          return (
            <div
              key={svc}
              className={`lane-wf-row${dim ? " dim" : ""}`}
              onMouseEnter={() => setHoverSvc(svc)}
              onMouseLeave={() => setHoverSvc(null)}
            >
              <div className="lane-wf-label">
                <span className="swatch" style={{ background: serviceColor(svc) }} />
                {svc}
                <span className="hint">{rows.length}</span>
              </div>
              <div className="lane-wf-track">
                {rows.map((r) => {
                  const bar = toPct(r.offsetUs, r.span.durationUs);
                  const err = r.span.statusCode === "ERROR";
                  const sel = selectedId === r.span.spanId;
                  return (
                    <button
                      key={r.span.spanId}
                      type="button"
                      className={`lane-wf-bar${err ? " err" : ""}${sel ? " selected" : ""}${r.onCriticalPath ? " critical" : ""}`}
                      style={{
                        left: `${bar.left}%`,
                        width: `${bar.width}%`,
                        background: serviceColor(svc),
                      }}
                      title={`${r.span.operationName} · ${formatDuration(r.span.durationUs)}`}
                      onClick={() => onSelect(r.span)}
                    />
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
