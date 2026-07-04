"use client";

import { formatDuration, serviceColor } from "@/lib/format";
import type { TraceSummary } from "@/lib/types";

interface DurationChartProps {
  traces: TraceSummary[];
  selectedId?: string | null;
  onPick?: (id: string) => void;
}

export function DurationChart({ traces, selectedId, onPick }: DurationChartProps) {
  if (traces.length === 0) return null;
  const maxDur = Math.max(...traces.map((t) => t.durationUs), 1);
  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="panel explore-chart">
      <div className="panel-title">
        <span>Duration distribution</span>
        <span className="hint">{traces.length} traces</span>
      </div>
      <div className="scatter">
        <div className="yaxis">
          {ticks.map((t) => (
            <div key={t} className="gl" style={{ bottom: `${t * 100}%` }}>
              <span className="lbl">{formatDuration(maxDur * t)}</span>
            </div>
          ))}
        </div>
        {traces.map((t, i) => {
          const rawX = traces.length > 1 ? (i / (traces.length - 1)) * 100 : 50;
          const x = Math.min(96, Math.max(4, rawX));
          const y = Math.min(96, Math.max(4, (t.durationUs / maxDur) * 100));
          const err = t.errorCount > 0;
          const sel = selectedId === t.traceId;
          return (
            <button
              key={t.traceId}
              type="button"
              className={`dot${sel ? " selected" : ""}`}
              title={`${t.rootService} · ${formatDuration(t.durationUs)}`}
              style={{ left: `${x}%`, bottom: `${y}%`, background: err ? "var(--err)" : serviceColor(t.rootService) }}
              onClick={() => onPick?.(t.traceId)}
            />
          );
        })}
      </div>
    </div>
  );
}
