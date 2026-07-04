"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchIncident } from "@/lib/api";
import { useProject } from "@/lib/project";
import { PageHeader } from "@/components/shell/PageHeader";
import { DependencyChain, EvidenceTraceList, RootCausePanel } from "@/components/intelligence/IncidentUI";
import type { Incident } from "@/lib/types";

export default function RCAPage() {
  const params = useParams();
  const id = Number(params.id);
  const { project } = useProject();
  const [incident, setIncident] = useState<Incident | null>(null);

  useEffect(() => {
    fetchIncident(project, id).then(setIncident).catch(() => setIncident(null));
  }, [project, id]);

  if (!incident) return <div className="page-body empty"><div className="big">Loading…</div></div>;

  return (
    <>
      <PageHeader title="Root Cause Analysis" subtitle={incident.title} />
      <div className="page-body stack">
        <RootCausePanel rootCause={incident.rootCause} />
        <div className="intel-card">
          <div className="panel-title" style={{ marginBottom: 10 }}>Dependency chain</div>
          <DependencyChain primary={incident.primaryService} bottleneck={incident.rootCause?.bottleneckService} />
          {incident.rootCause?.latencyInjectionPoint && (
            <p className="hint" style={{ marginTop: 12 }}>Injection point: {incident.rootCause.latencyInjectionPoint}</p>
          )}
        </div>
        <EvidenceTraceList traceIds={incident.rootCause?.evidenceTraceIds ?? []} project={project} />
      </div>
    </>
  );
}
