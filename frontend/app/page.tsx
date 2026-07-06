"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  fetchDependencies,
  fetchHotspots,
  fetchIntelligenceOverview,
  fetchServiceHealth,
} from "@/lib/api";
import { useProject } from "@/lib/project";
import { useTimeWindow } from "@/lib/time-context";
import { PageHeader } from "@/components/shell/PageHeader";
import { IncidentCard, InsightBanner, StatusPill } from "@/components/intelligence/IncidentUI";
import { DependencySummary, HotspotList, ServiceHealthGrid } from "@/components/intelligence/OverviewPanels";
import type { DependencyEdge, Hotspot, IntelligenceOverview, ServiceHealth } from "@/lib/types";

export default function HomePage() {
  const { project } = useProject();
  const { window, refreshKey } = useTimeWindow();
  const [data, setData] = useState<IntelligenceOverview | null>(null);
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [edges, setEdges] = useState<DependencyEdge[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setError(null);
    Promise.all([
      fetchIntelligenceOverview(project),
      fetchServiceHealth(project, window),
      fetchDependencies(project, window),
      fetchHotspots(project, window),
    ])
      .then(([overview, svc, deps, hot]) => {
        if (!active) return;
        setData(overview);
        setHealth(svc);
        setEdges(deps);
        setHotspots(hot);
      })
      .catch((e) => active && setError(String(e)));
    return () => {
      active = false;
    };
  }, [project, window, refreshKey]);

  const hasIncidents = (data?.recentIncidents?.length ?? 0) > 0;

  return (
    <>
      <PageHeader
        title="System Overview"
        subtitle="Incident intelligence for your distributed system"
        actions={<StatusPill status={data?.systemStatus ?? "healthy"} />}
      />
      <div className="page-body stack">
        {error && <div className="err-note">{error}</div>}
        {data && (
          <>
            <InsightBanner
              status={data.systemStatus}
              message={data.insight}
              actions={
                data.activeIncidents > 0 ? (
                  <Link href="/incidents" className="btn sm">
                    View all incidents
                  </Link>
                ) : (
                  <Link href="/connect" className="btn ghost sm">Connect your app</Link>
                )
              }
            />

            <div className="overview-metrics">
              <div className="intel-card overview-metric">
                <div className="hint">Active incidents</div>
                <div className="overview-metric__value">{data.activeIncidents}</div>
              </div>
              <div className="intel-card overview-metric">
                <div className="hint">Critical</div>
                <div className="overview-metric__value overview-metric__value--err">{data.criticalIncidents}</div>
              </div>
              <div className="intel-card overview-metric">
                <div className="hint">Top impacted</div>
                <div className="overview-metric__label">{data.topImpactedService || "—"}</div>
              </div>
              <div className="intel-card overview-metric">
                <div className="hint">Services monitored</div>
                <div className="overview-metric__value">{health.length || "—"}</div>
              </div>
            </div>

            {hasIncidents && (
              <section className="overview-section">
                <div className="section-label">Open incidents</div>
                <div className="stack">
                  {data.recentIncidents!.map((inc) => (
                    <IncidentCard key={inc.id} incident={inc} />
                  ))}
                </div>
              </section>
            )}

            <div className="overview-grid">
              <ServiceHealthGrid services={health} />
              <div className="overview-grid__side stack">
                <DependencySummary edges={edges} />
                <HotspotList hotspots={hotspots} project={project} />
              </div>
            </div>
          </>
        )}
        {!data && !error && <div className="empty"><div className="big">Loading system overview…</div></div>}
      </div>
    </>
  );
}
