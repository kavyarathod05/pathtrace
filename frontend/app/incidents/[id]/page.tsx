"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchIncident, fetchIncidentTimeline, resolveIncident } from "@/lib/api";
import { useProject } from "@/lib/project";
import { PageHeader } from "@/components/shell/PageHeader";
import {
  DependencyChain,
  EvidenceTraceList,
  PlaybookList,
  RootCausePanel,
  SeverityBadge,
  TimelineList,
} from "@/components/intelligence/IncidentUI";
import type { Incident, IncidentEvent } from "@/lib/types";

const TABS = [
  { href: "", label: "Overview" },
  { href: "/rca", label: "Root Cause" },
  { href: "/timeline", label: "Timeline" },
  { href: "/blast-radius", label: "Blast Radius" },
  { href: "/debug", label: "Debug Assistant" },
];

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
        <nav className="cluster" style={{ marginBottom: 8 }}>
          {TABS.map((t) => (
            <Link key={t.href} href={`/incidents/${id}${t.href}`} className="btn sm ghost">
              {t.label}
            </Link>
          ))}
        </nav>
        <RootCausePanel rootCause={incident.rootCause} />
        <DependencyChain primary={incident.primaryService} bottleneck={incident.rootCause?.bottleneckService} />
        {events.length > 0 && (
          <div className="intel-card">
            <div className="panel-title" style={{ marginBottom: 10 }}>Timeline</div>
            <TimelineList events={events} />
          </div>
        )}
        <EvidenceTraceList traceIds={incident.rootCause?.evidenceTraceIds ?? []} project={project} />
        <div className="intel-card">
          <div className="panel-title" style={{ marginBottom: 10 }}>Suggested fixes</div>
          <PlaybookList steps={incident.playbook} />
        </div>
        {incident.impacted?.length > 0 && (
          <div className="intel-card">
            <div className="panel-title" style={{ marginBottom: 10 }}>Impacted services</div>
            <div className="auto-grid" style={{ "--col-min": "160px" } as React.CSSProperties}>
              {incident.impacted.map((s) => (
                <div key={s.service} className="scorecard">
                  <div className="svc">{s.service}</div>
                  <div className="hint">severity {s.severity}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
