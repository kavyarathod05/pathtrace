"use client";

import Link from "next/link";
import type { Incident, IncidentEvent } from "@/lib/types";

export function SeverityBadge({ label, score }: { label: string; score?: number }) {
  const cls = label === "critical" ? "critical" : label === "warning" ? "warning" : "info";
  return (
    <span className={`severity-badge severity-badge--${cls}`}>
      {label}
      {score != null && <span className="mono">{score}</span>}
    </span>
  );
}

function timeAgo(iso: string) {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  return `${hrs}h ago`;
}

export function IncidentCard({ incident, compact }: { incident: Incident; compact?: boolean }) {
  const sevClass =
    incident.severityLabel === "critical"
      ? "intel-card--critical"
      : incident.severityLabel === "warning"
        ? "intel-card--warning"
        : "intel-card--info";
  const impacted = incident.impacted?.length ?? incident.blastRadius?.filter((b) => b.hop > 0).length ?? 0;
  const evidence = incident.rootCause?.evidenceTraceIds?.length ?? 0;

  return (
    <Link href={`/incidents/${incident.id}`} className={`intel-card incident-card ${sevClass}`}>
      <div className="incident-card__head">
        <h3 className="incident-card__title">{incident.title}</h3>
        <SeverityBadge label={incident.severityLabel} score={incident.severity} />
      </div>
      <div className="incident-card__meta">
        <span>{incident.primaryService}</span>
        <span className="incident-card__dot">·</span>
        <span className={`incident-card__status incident-card__status--${incident.status}`}>{incident.status}</span>
        <span className="incident-card__dot">·</span>
        <span>{timeAgo(incident.startedAt)}</span>
      </div>
      {!compact && incident.rootCause?.hypothesis && (
        <p className="incident-card__hypothesis">{incident.rootCause.hypothesis}</p>
      )}
      {!compact && (
        <div className="incident-card__stats">
          {impacted > 0 && <span>{impacted} downstream</span>}
          {evidence > 0 && <span>{evidence} evidence traces</span>}
          {incident.playbook?.length > 0 && <span>{incident.playbook.length} playbook steps</span>}
        </div>
      )}
    </Link>
  );
}

export function InsightBanner({
  status,
  message,
  actions,
}: {
  status: string;
  message: string;
  actions?: React.ReactNode;
}) {
  const cls =
    status === "critical" ? "insight-banner--critical" : status === "degraded" ? "insight-banner--degraded" : "";
  return (
    <div className={`insight-banner ${cls}`}>
      <p className="insight-banner__message">{message}</p>
      {actions && <div className="cluster">{actions}</div>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  return <span className={`status-pill status-pill--${status}`}>{status}</span>;
}

export function RootCausePanel({ rootCause }: { rootCause: Incident["rootCause"] }) {
  if (!rootCause?.hypothesis) return null;
  return (
    <div className="intel-card intel-card--warning">
      <div className="panel-title" style={{ marginBottom: 10 }}>
        Root cause hypothesis
        <span className="hint">{Math.round((rootCause.confidence ?? 0) * 100)}% confidence</span>
      </div>
      <p className="rca-hypothesis">{rootCause.hypothesis}</p>
      {(rootCause.reasoning?.length ?? 0) > 0 && (
        <ul className="rca-reasoning">
          {rootCause.reasoning!.map((r) => (
            <li key={r}>{r}</li>
          ))}
        </ul>
      )}
      {rootCause.bottleneckOperation && (
        <p className="hint" style={{ marginTop: 10 }}>
          Bottleneck operation: <strong>{rootCause.bottleneckOperation}</strong> on {rootCause.bottleneckService}
        </p>
      )}
    </div>
  );
}

export function PlaybookList({ steps }: { steps: Incident["playbook"] }) {
  if (!steps?.length) return null;
  return (
    <div>
      {steps.map((s) => (
        <div key={s.priority} className="playbook-step">
          <div className="playbook-step__priority">{s.priority}</div>
          <div className="contain">
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{s.action}</div>
            {s.rationale && <div className="hint">{s.rationale}</div>}
          </div>
        </div>
      ))}
    </div>
  );
}

const EVENT_LABELS: Record<string, string> = {
  incident_opened: "Incident opened",
  root_cause: "Root cause identified",
  evidence: "Evidence collected",
};

export function TimelineList({ events }: { events: IncidentEvent[] }) {
  return (
    <div className="timeline-list">
      {events.map((e) => {
        const typeCls =
          e.eventType.includes("deploy") ? "timeline-event--deploy"
          : e.eventType.includes("error") || e.eventType.includes("failure") ? "timeline-event--failure"
          : e.eventType.includes("spike") || e.eventType.includes("latency") ? "timeline-event--spike"
          : e.eventType === "root_cause" ? "timeline-event--rca"
          : e.eventType === "evidence" ? "timeline-event--evidence"
          : "";
        const traceIds = (e.evidence?.traceIds as string[] | undefined) ?? (
          e.evidence?.traceId ? [String(e.evidence.traceId)] : []
        );
        return (
          <div key={e.id ?? `${e.eventType}-${e.occurredAt}-${e.summary}`} className={`timeline-event ${typeCls}`}>
            <div className="timeline-event__time">{new Date(e.occurredAt).toLocaleString()}</div>
            <div className="timeline-event__body">
              <div className="timeline-event__type">{EVENT_LABELS[e.eventType] ?? e.eventType}</div>
              <div className="timeline-event__summary">{e.summary}</div>
              {e.service && <div className="hint">{e.service}</div>}
              {traceIds.length > 0 && (
                <div className="timeline-event__traces">
                  {traceIds.map((id) => (
                    <code key={id} className="timeline-trace-id">{id.slice(0, 12)}…</code>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function DependencyChain({
  primary,
  bottleneck,
}: {
  primary: string;
  bottleneck?: string;
}) {
  const chain = bottleneck && bottleneck !== primary ? [primary, bottleneck] : [primary];
  return (
    <div className="rca-chain">
      {chain.map((node, i) => (
        <span key={node} style={{ display: "contents" }}>
          {i > 0 && <span className="rca-arrow">→</span>}
          <span className={`rca-node${node === bottleneck ? " rca-node--bottleneck" : ""}`}>{node}</span>
        </span>
      ))}
    </div>
  );
}

export function EvidenceTraceList({ traceIds, project }: { traceIds: string[]; project: string }) {
  if (!traceIds?.length) return null;
  return (
    <div className="intel-card">
      <div className="panel-title" style={{ marginBottom: 10 }}>
        Evidence traces
        <span className="hint">{traceIds.length} samples</span>
      </div>
      <div className="evidence-trace-grid">
        {traceIds.map((id) => (
          <Link key={id} href={`/traces/${id}?project=${encodeURIComponent(project)}`} className="evidence-trace-link">
            <span className="mono">{id.slice(0, 20)}…</span>
            <span className="hint">Open trace</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

export function IncidentSummaryStrip({ incident }: { incident: Incident }) {
  const impacted = incident.impacted?.length ?? 0;
  const blast = incident.blastRadius?.length ?? 0;
  const evidence = incident.rootCause?.evidenceTraceIds?.length ?? 0;
  return (
    <div className="summary-strip">
      <div className="summary-strip__item">
        <span className="hint">Primary service</span>
        <strong>{incident.primaryService}</strong>
      </div>
      <div className="summary-strip__item">
        <span className="hint">Status</span>
        <strong>{incident.status}</strong>
      </div>
      <div className="summary-strip__item">
        <span className="hint">Started</span>
        <strong>{new Date(incident.startedAt).toLocaleString()}</strong>
      </div>
      <div className="summary-strip__item">
        <span className="hint">Blast radius</span>
        <strong>{blast} services</strong>
      </div>
      <div className="summary-strip__item">
        <span className="hint">Downstream</span>
        <strong>{impacted}</strong>
      </div>
      <div className="summary-strip__item">
        <span className="hint">Evidence</span>
        <strong>{evidence} traces</strong>
      </div>
    </div>
  );
}
