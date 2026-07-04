"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchIntelligenceOverview } from "@/lib/api";
import { useProject } from "@/lib/project";
import { PageHeader } from "@/components/shell/PageHeader";
import { IncidentCard, InsightBanner, StatusPill } from "@/components/intelligence/IncidentUI";
import type { IntelligenceOverview } from "@/lib/types";

export default function HomePage() {
  const { project } = useProject();
  const [data, setData] = useState<IntelligenceOverview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIntelligenceOverview(project)
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [project]);

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
                    View {data.activeIncidents} incident{data.activeIncidents !== 1 ? "s" : ""}
                  </Link>
                ) : (
                  <Link href="/connect" className="btn ghost sm">Connect your app</Link>
                )
              }
            />
            <div className="auto-grid" style={{ "--col-min": "200px" } as React.CSSProperties}>
              <div className="intel-card">
                <div className="hint">Active incidents</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--text)" }}>{data.activeIncidents}</div>
              </div>
              <div className="intel-card">
                <div className="hint">Critical</div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--err)" }}>{data.criticalIncidents}</div>
              </div>
              <div className="intel-card">
                <div className="hint">Top impacted</div>
                <div style={{ fontSize: 16, fontWeight: 600 }}>{data.topImpactedService || "—"}</div>
              </div>
            </div>
            {data.recentIncidents && data.recentIncidents.length > 0 && (
              <>
                <div className="section-label">Open incidents</div>
                <div className="stack">
                  {data.recentIncidents.map((inc) => (
                    <IncidentCard key={inc.id} incident={inc} />
                  ))}
                </div>
              </>
            )}
          </>
        )}
        {!data && !error && <div className="empty"><div className="big">Loading system overview…</div></div>}
      </div>
    </>
  );
}
