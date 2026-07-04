"use client";

import Link from "next/link";
import type { ServiceHealth } from "@/lib/types";
import { impactScore, maxImpact, topFailing, topImpact, topSlow } from "@/lib/monitor";
import { formatDuration, formatPercent, serviceColor } from "@/lib/format";

interface ImpactedServicesSectionProps {
  health: ServiceHealth[];
  onSelect: (service: string) => void;
}

function ImpactRow({
  h,
  metric,
  onSelect,
}: {
  h: ServiceHealth;
  metric: React.ReactNode;
  onSelect: (service: string) => void;
}) {
  return (
    <button type="button" className="impact-row" onClick={() => onSelect(h.service)}>
      <span className="svc-tag">
        <span className="swatch" style={{ background: serviceColor(h.service) }} />
        {h.service}
      </span>
      <span className="impact-row__metric">{metric}</span>
    </button>
  );
}

export function ImpactedServicesSection({ health, onSelect }: ImpactedServicesSectionProps) {
  if (health.length === 0) return null;

  const failing = topFailing(health);
  const slow = topSlow(health);
  const impact = topImpact(health);
  const max = maxImpact(health);

  return (
    <div className="panel impacted-panel">
      <div className="panel-title">
        <span>Impacted services</span>
        <Link className="link" href="/health">View all services →</Link>
      </div>
      <div className="impacted-grid">
        <div className="impacted-col">
          <div className="impacted-col__title">Top failing</div>
          {failing.map((h) => (
            <ImpactRow
              key={h.service}
              h={h}
              onSelect={onSelect}
              metric={
                <span className={`impact-row__metric${h.errorRate > 0.05 ? " err" : h.errorRate > 0.01 ? " warn" : ""}`}>
                  {formatPercent(h.errorRate)}
                </span>
              }
            />
          ))}
        </div>
        <div className="impacted-col">
          <div className="impacted-col__title">Top slow</div>
          {slow.map((h) => (
            <ImpactRow
              key={h.service}
              h={h}
              onSelect={onSelect}
              metric={
                <span className={`impact-row__metric${h.p95Us > 400_000 ? " err" : h.p95Us > 150_000 ? " warn" : ""}`}>
                  p95 {formatDuration(h.p95Us)}
                </span>
              }
            />
          ))}
        </div>
        <div className="impacted-col">
          <div className="impacted-col__title">Highest impact</div>
          {impact.map((h) => {
            const pct = (impactScore(h) / max) * 100;
            return (
              <div key={h.service} className="impact-bar-row">
                <button type="button" className="impact-row impact-row--bar" onClick={() => onSelect(h.service)}>
                  <span className="svc-tag">
                    <span className="swatch" style={{ background: serviceColor(h.service) }} />
                    {h.service}
                  </span>
                </button>
                <div className="impact-bar-track">
                  <div className="impact-bar-fill" style={{ width: `${pct}%` }} />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
