"use client";

import Link from "next/link";
import type { DependencyEdge, Hotspot, ServiceHealth } from "@/lib/types";

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtMs(us: number) {
  return us >= 1000 ? `${(us / 1000).toFixed(0)}ms` : `${us}µs`;
}

export function ServiceHealthGrid({ services }: { services: ServiceHealth[] }) {
  if (!services.length) return null;
  const sorted = [...services].sort((a, b) => b.errorRate - a.errorRate);
  return (
    <div className="intel-card">
      <div className="panel-title" style={{ marginBottom: 12 }}>
        Service health
        <span className="hint">{sorted.length} services · last hour</span>
      </div>
      <div className="health-table-wrap">
        <table className="health-table">
          <thead>
            <tr>
              <th>Service</th>
              <th>Error rate</th>
              <th>P95 latency</th>
              <th>Throughput</th>
              <th>Spans</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((s) => {
              const hot = s.errorRate >= 0.05;
              return (
                <tr key={s.service} className={hot ? "health-table__row--warn" : undefined}>
                  <td>
                    <span className="health-table__svc">{s.service}</span>
                  </td>
                  <td className={hot ? "health-table__err" : undefined}>{fmtPct(s.errorRate)}</td>
                  <td>{fmtMs(s.p95Us)}</td>
                  <td>{s.throughputPerMin.toFixed(1)}/min</td>
                  <td className="hint">{s.spanCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function DependencySummary({ edges }: { edges: DependencyEdge[] }) {
  if (!edges.length) return null;
  const top = [...edges].sort((a, b) => b.callCount - a.callCount).slice(0, 8);
  return (
    <div className="intel-card">
      <div className="panel-title" style={{ marginBottom: 12 }}>
        Service dependencies
        <span className="hint">top call paths</span>
      </div>
      <div className="dep-list">
        {top.map((e) => (
          <div key={`${e.parent}-${e.child}`} className="dep-row">
            <span className="dep-row__path">
              <span className="dep-row__svc">{e.parent}</span>
              <span className="dep-row__arrow">→</span>
              <span className="dep-row__svc">{e.child}</span>
            </span>
            <span className="dep-row__stats">
              {e.callCount} calls
              {e.errorCount > 0 && (
                <span className="dep-row__err"> · {e.errorCount} errors</span>
              )}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

export function HotspotList({ hotspots, project }: { hotspots: Hotspot[]; project: string }) {
  if (!hotspots.length) return null;
  return (
    <div className="intel-card">
      <div className="panel-title" style={{ marginBottom: 12 }}>
        Error hotspots
        <span className="hint">operations with elevated failures</span>
      </div>
      <div className="stack">
        {hotspots.slice(0, 6).map((h) => (
          <Link
            key={`${h.service}-${h.operation}`}
            href={`/explore?project=${encodeURIComponent(project)}&service=${encodeURIComponent(h.service)}&onlyErrors=true`}
            className="hotspot-row"
          >
            <div>
              <div className="hotspot-row__op">{h.operation}</div>
              <div className="hint">{h.service}</div>
            </div>
            <div className="hotspot-row__rate">{fmtPct(h.errorRate)}</div>
          </Link>
        ))}
      </div>
    </div>
  );
}
