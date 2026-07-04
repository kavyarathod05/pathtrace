"use client";

import { useEffect, useState } from "react";
import { fetchHotspots, fetchServiceHealth } from "@/lib/api";
import { useProject } from "@/lib/project";
import { useTimeWindow } from "@/lib/time-context";
import type { Hotspot, ServiceHealth } from "@/lib/types";
import { formatDuration, formatPercent, serviceColor } from "@/lib/format";
import { PageHeader } from "@/components/shell/PageHeader";

function LatencyBar({ h }: { h: ServiceHealth }) {
  const max = Math.max(h.p99Us, 1);
  const pct = (v: number) => `${Math.min(100, (v / max) * 100)}%`;
  return (
    <div className="lat-bar" title={`p50 ${formatDuration(h.p50Us)} · p95 ${formatDuration(h.p95Us)} · p99 ${formatDuration(h.p99Us)}`}>
      <span style={{ width: pct(h.p50Us), background: "var(--ok)", opacity: 0.7 }} />
      <span style={{ width: pct(h.p95Us - h.p50Us), background: "var(--warn)", opacity: 0.75 }} />
      <span style={{ width: pct(h.p99Us - h.p95Us), background: "var(--err)", opacity: 0.8 }} />
    </div>
  );
}

export default function HealthPage() {
  const { project } = useProject();
  const { window: win, refreshKey } = useTimeWindow();
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.all([fetchServiceHealth(project, win), fetchHotspots(project, win)])
      .then(([h, s]) => { setHealth(h); setHotspots(s); })
      .catch((e) => setError(String(e)));
  }, [win, project, refreshKey]);

  const latencyClass = (us: number) => (us > 400_000 ? "err" : us > 150_000 ? "warn" : "");
  const errClass = (r: number) => (r > 0.05 ? "err" : r > 0.01 ? "warn" : "");

  return (
    <>
      <PageHeader
        title="Service Health"
        subtitle="Latency percentiles, error rate, and throughput per service"
      />

      <div className="page-body">
        {error && <div className="err-note" style={{ marginBottom: 16 }}>{error}</div>}

        {health.length === 0 ? (
          <div className="empty"><div className="big">No traffic in this window</div>Try a longer time range or send demo traffic.</div>
        ) : (
          <div className="card-grid">
            {health.map((h) => (
              <div className="scorecard" key={h.service}>
                <div className="head">
                  <div className="svc">
                    <span className="swatch" style={{ background: serviceColor(h.service) }} />
                    {h.service}
                  </div>
                  <span className={`chip${errClass(h.errorRate) ? " accent" : ""}`} style={{ color: errClass(h.errorRate) === "err" ? "var(--err)" : undefined }}>
                    {formatPercent(h.errorRate)} err
                  </span>
                </div>
                <div className="metrics">
                  <div className="metric"><div className="k">p50</div><div className={`v ${latencyClass(h.p50Us)}`}>{formatDuration(h.p50Us)}</div></div>
                  <div className="metric"><div className="k">p95</div><div className={`v ${latencyClass(h.p95Us)}`}>{formatDuration(h.p95Us)}</div></div>
                  <div className="metric"><div className="k">p99</div><div className={`v ${latencyClass(h.p99Us)}`}>{formatDuration(h.p99Us)}</div></div>
                </div>
                <LatencyBar h={h} />
                <div className="foot">
                  <span>{h.throughputPerMin.toFixed(1)} spans/min</span>
                  <span>{h.spanCount.toLocaleString()} spans</span>
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="panel" style={{ marginTop: 22 }}>
          <div className="panel-title"><span>Error hotspots</span><span className="hint">operations ranked by error count</span></div>
          {hotspots.length === 0 ? (
            <div className="empty">No errors in this window — looking good.</div>
          ) : (
            <table>
              <thead>
                <tr><th>Service</th><th>Operation</th><th className="num">Errors</th><th className="num">Total</th><th className="num">Error rate</th></tr>
              </thead>
              <tbody>
                {hotspots.map((h) => (
                  <tr key={`${h.service}/${h.operation}`}>
                    <td><span className="svc-tag"><span className="swatch" style={{ background: serviceColor(h.service) }} />{h.service}</span></td>
                    <td><code>{h.operation}</code></td>
                    <td className="num"><span className="badge-err">{h.errorCount}</span></td>
                    <td className="num">{h.totalCount}</td>
                    <td className="num" style={{ color: h.errorRate > 0.05 ? "var(--err)" : "var(--warn)" }}>{formatPercent(h.errorRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
