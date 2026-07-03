"use client";

import { formatDuration } from "@/lib/format";

export interface LineSeries {
  label: string;
  color: string;
  values: number[];
}

interface LineChartProps {
  labels: string[];
  series: LineSeries[];
  height?: number;
  formatValue?: (v: number) => string;
}

export function LineChart({ labels, series, height = 160, formatValue = formatDuration }: LineChartProps) {
  if (labels.length === 0) return <div className="empty">No data</div>;

  const allVals = series.flatMap((s) => s.values);
  const max = Math.max(1, ...allVals);
  const w = 640;
  const pad = { t: 12, r: 12, b: 28, l: 48 };
  const innerW = w - pad.l - pad.r;
  const innerH = height - pad.t - pad.b;

  const x = (i: number) => pad.l + (i / Math.max(1, labels.length - 1)) * innerW;
  const y = (v: number) => pad.t + innerH - (v / max) * innerH;

  return (
    <div className="line-chart">
      <svg viewBox={`0 0 ${w} ${height}`} width="100%" height={height}>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={w - pad.r} y1={y(max * t)} y2={y(max * t)} stroke="var(--border)" strokeDasharray="4 4" />
            <text x={4} y={y(max * t) + 4} fontSize={9} fill="var(--text-faint)" fontFamily="var(--mono)">
              {formatValue(max * t)}
            </text>
          </g>
        ))}
        {series.map((s) => {
          const pts = s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          return (
            <g key={s.label}>
              <polyline fill="none" stroke={s.color} strokeWidth={2} points={pts} />
              {s.values.map((v, i) => (
                <circle key={i} cx={x(i)} cy={y(v)} r={3} fill={s.color} />
              ))}
            </g>
          );
        })}
        {labels.map((lbl, i) => (
          <text key={i} x={x(i)} y={height - 6} textAnchor="middle" fontSize={9} fill="var(--text-faint)">
            {lbl}
          </text>
        ))}
      </svg>
      <div className="chart-legend">
        {series.map((s) => (
          <span key={s.label} className="legend-item">
            <span className="swatch" style={{ background: s.color }} />
            {s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
