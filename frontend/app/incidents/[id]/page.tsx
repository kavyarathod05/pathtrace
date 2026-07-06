"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchIncident, fetchIncidentTimeline, resolveIncident } from "@/lib/api";
import { useProject } from "@/lib/project";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  EvidenceTraceList,
  IncidentSummaryStrip,
  PlaybookList,
  RootCausePanel,
  SeverityBadge,
  TimelineList,
} from "@/components/intelligence/IncidentUI";
import type { Incident, IncidentEvent } from "@/lib/types";

export default function IncidentDetailPage() {
  const params = useParams();
  const id = Number(params.id);
  const { project } = useProject();
  const [incident, setIncident] = useState<Incident | null>(null);
  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([fetchIncident(project, id), fetchIncidentTimeline(project, id)])
      .then(([inc, ev]) => {
        setIncident(inc);
        setEvents(ev);
      })
      .catch((e) => setError(String(e)));
  }, [project, id]);

  const resolve = () => {
    resolveIncident(project, id).then(() => fetchIncident(project, id).then(setIncident));
  };

  if (error) return <div className="page-body err-note">{error}</div>;
  if (!incident) return <div className="page-body empty"><div className="big">Loading incident…</div></div>;

  const previewEvents = events.slice(0, 4);

  return (
    <>
      <PageHeader
        title={incident.title}
        subtitle={`${incident.primaryService} · ${incident.status}`}
        actions={
          <>
            <SeverityBadge label={incident.severityLabel} score={incident.severity} />
            {incident.status === "open" && (
              <button type="button" className="btn sm ghost" onClick={resolve}>Resolve</button>
            )}
          </>
        }
      />
      <div className="page-body stack">
        <IncidentSummaryStrip incident={incident} />
        <RootCausePanel rootCause={incident.rootCause} />

        {incident.impacted?.length > 0 && (
          <div className="intel-card">
            <div className="panel-title" style={{ marginBottom: 10 }}>Impacted services</div>
            <div className="auto-grid" style={{ "--col-min": "160px" } as React.CSSProperties}>
              {incident.impacted.map((s) => (
                <div key={s.service} className="scorecard">
                  <div className="svc">{s.service}</div>
                  <div className="hint">severity {s.severity}</div>
                  {s.errorRate != null && s.errorRate > 0 && (
                    <div className="hint">{(s.errorRate * 100).toFixed(1)}% errors</div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {previewEvents.length > 0 && (
          <div className="intel-card">
            <div className="panel-title panel-title--split">
              <span>Recent timeline</span>
              <Link href={`/incidents/${id}/timeline`} className="btn ghost sm">View full timeline</Link>
            </div>
            <TimelineList events={previewEvents} />
          </div>
        )}

        <EvidenceTraceList traceIds={incident.rootCause?.evidenceTraceIds ?? []} project={project} />

        {incident.playbook?.length > 0 && (
          <div className="intel-card">
            <div className="panel-title panel-title--split">
              <span>Suggested fixes</span>
              <Link href={`/incidents/${id}/debug`} className="btn ghost sm">Open debug assistant</Link>
            </div>
            <PlaybookList steps={incident.playbook.slice(0, 3)} />
          </div>
        )}
      </div>
    </>
  );
}
