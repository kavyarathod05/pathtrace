"use client";

import { useState } from "react";
import { LineChart } from "@/components/LineChart";
import type { TimeSeriesPoint } from "@/lib/types";
import { bucketErrorRate } from "@/lib/monitor";
import { formatDuration, formatPercent } from "@/lib/format";

type TrendTab = "latency" | "errors" | "volume";

interface TrendPanelProps {
  points: TimeSeriesPoint[];
  step: string;
  services: string[];
  scope: string;
  onScopeChange: (service: string) => void;
  loading?: boolean;
}

const TABS: { id: TrendTab; label: string }[] = [
  { id: "latency", label: "Latency" },
  { id: "errors", label: "Errors" },
  { id: "volume", label: "Volume" },
];

export function TrendPanel({ points, step, services, scope, onScopeChange, loading }: TrendPanelProps) {
  const [tab, setTab] = useState<TrendTab>("latency");

  const labels = points.map((p) =>
    new Date(p.time).toLocaleTimeString(undefined, {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  );

  return (
    <div className="panel trend-panel">
      <div className="panel-title trend-panel__head">
        <div className="trend-panel__tabs seg">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={tab === t.id ? "on" : ""}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="trend-panel__scope field" style={{ margin: 0 }}>
          <label>Scope</label>
          <select value={scope} onChange={(e) => onScopeChange(e.target.value)} disabled={!services.length}>
            {services.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="trend-panel__body">
        {loading ? (
          <div className="empty">Loading trends…</div>
        ) : points.length === 0 ? (
          <div className="empty">No trend data in this window</div>
        ) : tab === "latency" ? (
          <LineChart
            height={260}
            labels={labels}
            formatValue={formatDuration}
            series={[
              { label: "p50", color: "var(--ok)", values: points.map((p) => p.p50Us) },
              { label: "p95", color: "var(--warn)", values: points.map((p) => p.p95Us) },
              { label: "p99", color: "var(--err)", values: points.map((p) => p.p99Us) },
            ]}
          />
        ) : tab === "errors" ? (
          <LineChart
            height={260}
            labels={labels}
            formatValue={formatPercent}
            series={[
              { label: "error rate", color: "var(--err)", values: points.map(bucketErrorRate) },
              { label: "error count", color: "var(--warn)", values: points.map((p) => p.errorCount) },
            ]}
          />
        ) : (
          <LineChart
            height={260}
            labels={labels}
            formatValue={(v) => v.toFixed(0)}
            series={[{ label: "requests", color: "var(--accent)", values: points.map((p) => p.count) }]}
          />
        )}
        <div className="trend-panel__hint hint">{step} buckets · scoped to {scope}</div>
      </div>
    </div>
  );
}
