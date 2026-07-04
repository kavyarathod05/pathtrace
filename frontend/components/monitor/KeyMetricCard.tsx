"use client";

import { Sparkline } from "./Sparkline";

interface KeyMetricCardProps {
  label: string;
  value: string;
  delta?: number | null;
  deltaLabel?: string;
  sparkline?: number[];
  sparkColor?: string;
  valueClass?: string;
  invertDelta?: boolean;
}

function formatDelta(delta: number, invert: boolean): { text: string; className: string } {
  const isUp = delta > 0;
  const isBad = invert ? !isUp : isUp;
  const arrow = isUp ? "↑" : delta < 0 ? "↓" : "→";
  const className = Math.abs(delta) < 1 ? "" : isBad ? "bad" : "good";
  return { text: `${arrow} ${Math.abs(delta).toFixed(1)}%`, className };
}

export function KeyMetricCard({
  label,
  value,
  delta,
  deltaLabel = "vs prior half",
  sparkline,
  sparkColor,
  valueClass,
  invertDelta,
}: KeyMetricCardProps) {
  const deltaFmt = delta != null ? formatDelta(delta, !!invertDelta) : null;

  return (
    <div className="kpi-card">
      <div className="kpi-card__label">{label}</div>
      <div className={`kpi-card__value${valueClass ? ` ${valueClass}` : ""}`}>{value}</div>
      {deltaFmt && (
        <div className={`kpi-card__delta${deltaFmt.className ? ` ${deltaFmt.className}` : ""}`}>
          {deltaFmt.text} <span className="kpi-card__delta-hint">{deltaLabel}</span>
        </div>
      )}
      {sparkline && sparkline.length > 1 && (
        <Sparkline values={sparkline} color={sparkColor} />
      )}
    </div>
  );
}
