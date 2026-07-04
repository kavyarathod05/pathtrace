"use client";

import type { Incident } from "@/lib/types";

export function SeverityBadge({ label, score }: { label: string; score?: number }) {
  const cls = label === "critical" ? "critical" : label === "warning" ? "warning" : "info";
  return (
    <span className={`severity-badge severity-badge--${cls}`}>
      {label}
      {score != null && <span className="mono">{score}</span>}
    </span>
  );
}

export function IncidentCard({ incident }: { incident: Incident }) {
  const sevClass =
    incident.severityLabel === "critical"
      ? "intel-card--critical"
      : incident.severityLabel === "warning"
        ? "intel-card--warning"
        : "intel-card--info";
  return (
    <a href={`/incidents/${incident.id}`} className={`intel-card incident-card ${sevClass}`}>
      <div className="incident-card__head">
        <h3 className="incident-card__title">{incident.title}</h3>
        <SeverityBadge label={incident.severityLabel} score={incident.severity} />
      </div>
      <div className="incident-card__meta">
        {incident.primaryService} · {new Date(incident.startedAt).toLocaleString()}
      </div>
      {incident.rootCause?.hypothesis && (
        <p className="hint" style={{ margin: "8px 0 0", lineHeight: 1.45 }}>
          {incident.rootCause.hypothesis}
        </p>
      )}
    </a>
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
      <p style={{ margin: "0 0 12px", fontSize: 14, lineHeight: 1.5 }}>{rootCause.hypothesis}</p>
      {rootCause.reasoning?.map((r) => (
        <div key={r} className="hint" style={{ marginBottom: 4 }}>
          • {r}
        </div>
      ))}
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

export function TimelineList({ events }: { events: { eventType: string; summary: string; occurredAt: string; service?: string }[] }) {
  return (
    <div className="timeline-list">
      {events.map((e, i) => {
        const typeCls =
          e.eventType.includes("deploy") ? "timeline-event--deploy"
          : e.eventType.includes("error") || e.eventType.includes("failure") ? "timeline-event--failure"
          : e.eventType.includes("spike") || e.eventType.includes("latency") ? "timeline-event--spike"
          : "";
        return (
          <div key={i} className={`timeline-event ${typeCls}`}>
            <div className="timeline-event__time">{new Date(e.occurredAt).toLocaleString()}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 13 }}>{e.summary}</div>
              {e.service && <div className="hint">{e.service}</div>}
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
      <div className="panel-title" style={{ marginBottom: 10 }}>Evidence traces</div>
      <div className="stack">
        {traceIds.map((id) => (
          <a key={id} href={`/traces/${id}?project=${encodeURIComponent(project)}`} className="link mono">
            {id.slice(0, 16)}…
          </a>
        ))}
      </div>
    </div>
  );
}
