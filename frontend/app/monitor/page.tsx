"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchOperations, fetchRED, fetchServices } from "@/lib/api";
import { useProject } from "@/lib/project";
import { LineChart } from "@/components/LineChart";
import { TimeWindowSelect } from "@/components/TimeWindowSelect";
import type { REDSeries } from "@/lib/types";
import { formatDuration, formatPercent } from "@/lib/format";

function stepFor(win: string): string {
  switch (win) {
    case "15m": return "1m";
    case "1h": return "1m";
    case "6h": return "5m";
    case "24h": return "30m";
    default: return "1m";
  }
}

export default function MonitorPage() {
  const { project } = useProject();
  const [services, setServices] = useState<string[]>([]);
  const [operations, setOperations] = useState<string[]>([]);
  const [service, setService] = useState("");
  const [operation, setOperation] = useState("");
  const [win, setWin] = useState("1h");
  const [red, setRed] = useState<REDSeries | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchServices(project)
      .then((s) => {
        setServices(s);
        if (s.length && !service) setService(s[0]);
      })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  useEffect(() => {
    if (service) {
      fetchOperations(project, service).then(setOperations).catch(() => setOperations([]));
    } else {
      setOperations([]);
    }
    setOperation("");
  }, [service, project]);

  useEffect(() => {
    if (!service) return;
    setLoading(true);
    setError(null);
    fetchRED(project, service, operation || undefined, win, stepFor(win))
      .then(setRed)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [service, operation, win, project]);

  const labels = useMemo(
    () => (red?.points ?? []).map((p) => new Date(p.time).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false })),
    [red],
  );

  const totals = useMemo(() => {
    const pts = red?.points ?? [];
    const count = pts.reduce((a, p) => a + p.count, 0);
    const errs = pts.reduce((a, p) => a + p.errorCount, 0);
    const p95 = Math.max(0, ...pts.map((p) => p.p95Us));
    return { count, errs, errorRate: count ? errs / count : 0, p95 };
  }, [red]);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Monitor · RED Metrics</h1>
          <div className="sub">Rate, errors, and duration for <code>{project}</code></div>
        </div>
      </div>

      <div className="page-body">
        <div className="toolbar">
          <div className="field">
            <label>Service</label>
            <select value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">Select service…</option>
              {services.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Operation</label>
            <select value={operation} onChange={(e) => setOperation(e.target.value)} disabled={!service}>
              <option value="">All operations</option>
              {operations.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <TimeWindowSelect value={win} onChange={setWin} />
          <div className="spacer" />
          {service && (
            <Link className="btn ghost" href={`/explore?service=${encodeURIComponent(service)}${operation ? `&operation=${encodeURIComponent(operation)}` : ""}`}>
              View traces →
            </Link>
          )}
        </div>

        {error && <div className="err-note" style={{ marginBottom: 16 }}>{error}</div>}

        {!service ? (
          <div className="empty"><div className="big">Pick a service to see RED metrics</div>Rate, errors, and duration over time.</div>
        ) : (
          <>
            <div className="stat-strip" style={{ marginBottom: 18 }}>
              <div className="stat"><div className="k">Requests</div><div className="v">{totals.count.toLocaleString()}</div></div>
              <div className="stat"><div className="k">Errors</div><div className={`v${totals.errs ? " err" : ""}`}>{totals.errs.toLocaleString()}</div></div>
              <div className="stat"><div className="k">Error rate</div><div className={`v${totals.errorRate > 0.05 ? " err" : ""}`}>{formatPercent(totals.errorRate)}</div></div>
              <div className="stat"><div className="k">Peak p95</div><div className="v accent">{formatDuration(totals.p95)}</div></div>
            </div>

            <div className="panel" style={{ marginBottom: 18 }}>
              <div className="panel-title"><span>Duration percentiles</span><span className="hint">{loading ? "loading…" : `${red?.step ?? ""} buckets`}</span></div>
              <div style={{ padding: 16 }}>
                <LineChart
                  labels={labels}
                  formatValue={formatDuration}
                  series={[
                    { label: "p50", color: "var(--ok)", values: (red?.points ?? []).map((p) => p.p50Us) },
                    { label: "p95", color: "var(--warn)", values: (red?.points ?? []).map((p) => p.p95Us) },
                    { label: "p99", color: "var(--err)", values: (red?.points ?? []).map((p) => p.p99Us) },
                  ]}
                />
              </div>
            </div>

            <div className="row-gap">
              <div className="grow panel">
                <div className="panel-title"><span>Request rate</span><span className="hint">spans per bucket</span></div>
                <div style={{ padding: 16 }}>
                  <LineChart
                    labels={labels}
                    formatValue={(v) => v.toFixed(0)}
                    series={[{ label: "requests", color: "var(--accent)", values: (red?.points ?? []).map((p) => p.count) }]}
                  />
                </div>
              </div>
              <div className="grow panel">
                <div className="panel-title"><span>Errors</span><span className="hint">error count per bucket</span></div>
                <div style={{ padding: 16 }}>
                  <LineChart
                    labels={labels}
                    formatValue={(v) => v.toFixed(0)}
                    series={[{ label: "errors", color: "var(--err)", values: (red?.points ?? []).map((p) => p.errorCount) }]}
                  />
                </div>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
}
