"use client";

interface SparklineProps {
  values: number[];
  color?: string;
  height?: number;
}

export function Sparkline({ values, color = "var(--accent)", height = 32 }: SparklineProps) {
  if (values.length < 2) {
    return <div className="sparkline sparkline--empty" style={{ height }} />;
  }

  const max = Math.max(1, ...values);
  const w = 120;
  const pad = 2;
  const innerH = height - pad * 2;
  const x = (i: number) => pad + (i / (values.length - 1)) * (w - pad * 2);
  const y = (v: number) => pad + innerH - (v / max) * innerH;
  const pts = values.map((v, i) => `${x(i)},${y(v)}`).join(" ");

  return (
    <svg className="sparkline" viewBox={`0 0 ${w} ${height}`} width="100%" height={height} preserveAspectRatio="none">
      <polyline fill="none" stroke={color} strokeWidth={1.5} points={pts} opacity={0.85} />
    </svg>
  );
}
