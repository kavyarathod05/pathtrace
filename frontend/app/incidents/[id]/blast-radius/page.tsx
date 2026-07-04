"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchIncident, fetchIncidentBlast } from "@/lib/api";
import { useProject } from "@/lib/project";
import { PageHeader } from "@/components/shell/PageHeader";
import type { BlastRadiusEntry, DependencyEdge, Incident } from "@/lib/types";

export default function BlastRadiusPage() {
  const params = useParams();
  const id = Number(params.id);
  const { project } = useProject();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [blast, setBlast] = useState<BlastRadiusEntry[]>([]);
  const [edges, setEdges] = useState<DependencyEdge[]>([]);

  useEffect(() => {
    Promise.all([fetchIncident(project, id), fetchIncidentBlast(project, id)]).then(([inc, b]) => {
      setIncident(inc);
      setBlast(b.blastRadius ?? inc.blastRadius ?? []);
      setEdges(b.edges ?? []);
    });
  }, [project, id]);

  if (!incident) return <div className="page-body empty"><div className="big">Loading…</div></div>;

  return (
    <>
      <PageHeader title="Blast Radius" subtitle={`Propagation from ${incident.primaryService}`} />
      <div className="page-body stack">
        <div className="auto-grid" style={{ "--col-min": "180px" } as React.CSSProperties}>
          {blast.map((b) => (
            <div
              key={b.service}
              className={`intel-card${b.hop === 0 ? " intel-card--critical" : b.severity > 50 ? " intel-card--warning" : ""}`}
            >
              <div style={{ fontWeight: 650 }}>{b.service}</div>
              <div className="hint">hop {b.hop} · severity {b.severity}</div>
              {b.errorRate != null && b.errorRate > 0 && (
                <div className="hint">error rate {(b.errorRate * 100).toFixed(1)}%</div>
              )}
            </div>
          ))}
        </div>
        {edges.length > 0 && (
          <div className="intel-card">
            <div className="panel-title" style={{ marginBottom: 10 }}>Dependency edges</div>
            <div className="stack">
              {edges.slice(0, 20).map((e) => (
                <div key={`${e.parent}-${e.child}`} className="hint">
                  {e.parent} → {e.child} ({e.callCount} calls)
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
