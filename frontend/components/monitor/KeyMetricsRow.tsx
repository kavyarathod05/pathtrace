"use client";

import type { TimeSeriesPoint } from "@/lib/types";
import type { AggregatedKPIs } from "@/lib/monitor";
import { bucketErrorRate, seriesDelta } from "@/lib/monitor";
import { formatDuration, formatPercent } from "@/lib/format";
import { KeyMetricCard } from "./KeyMetricCard";

interface KeyMetricsRowProps {
  kpis: AggregatedKPIs;
  points: TimeSeriesPoint[];
}

export function KeyMetricsRow({ kpis, points }: KeyMetricsRowProps) {
  const rateSpark = points.map((p) => p.count);
  const errSpark = points.map(bucketErrorRate);
  const p95Spark = points.map((p) => p.p95Us);
  const p99Spark = points.map((p) => p.p99Us);

  const rateDelta = seriesDelta(points, (p) => p.count);
  const errDelta = seriesDelta(points, bucketErrorRate);
  const p95Delta = seriesDelta(points, (p) => p.p95Us);
  const p99Delta = seriesDelta(points, (p) => p.p99Us);

  const errClass = kpis.errorRate > 0.05 ? "err" : kpis.errorRate > 0.01 ? "warn" : "";
  const latClass = kpis.p95Us > 400_000 ? "err" : kpis.p95Us > 150_000 ? "warn" : "";

  return (
    <div className="kpi-row">
      <KeyMetricCard
        label="Request rate"
        value={`${kpis.requestRate.toFixed(1)}/min`}
        delta={rateDelta}
        sparkline={rateSpark}
        sparkColor="var(--accent)"
      />
      <KeyMetricCard
        label="Error rate"
        value={formatPercent(kpis.errorRate)}
        delta={errDelta != null ? errDelta : null}
        deltaLabel="vs prior half"
        sparkline={errSpark}
        sparkColor="var(--err)"
        valueClass={errClass}
      />
      <KeyMetricCard
        label="p95 latency"
        value={formatDuration(kpis.p95Us)}
        delta={p95Delta}
        sparkline={p95Spark}
        sparkColor="var(--warn)"
        valueClass={latClass}
      />
      <KeyMetricCard
        label="p99 latency"
        value={formatDuration(kpis.p99Us)}
        delta={p99Delta}
        sparkline={p99Spark}
        sparkColor="var(--err)"
        valueClass={latClass}
      />
    </div>
  );
}
