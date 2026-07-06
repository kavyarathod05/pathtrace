"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { DebugContext, PlaybookStep } from "@/lib/types";

function fmtPct(n: number) {
  return `${(n * 100).toFixed(1)}%`;
}

function fmtMs(us: number) {
  return us >= 1000 ? `${(us / 1000).toFixed(0)}ms` : `${us}µs`;
}

function stepKey(incidentId: number, step: PlaybookStep) {
  return `pathtrace-debug-${incidentId}-${step.priority}`;
}

function loadCompleted(incidentId: number, steps: PlaybookStep[]): Set<number> {
  if (typeof window === "undefined") return new Set();
  const done = new Set<number>();
  for (const s of steps) {
    if (localStorage.getItem(stepKey(incidentId, s)) === "1") {
      done.add(s.priority);
    }
  }
  return done;
}

function StepAction({ step, project }: { step: PlaybookStep; project: string }) {
  if (step.kind === "trace" && step.traceId) {
    const href = step.href ?? `/traces/${step.traceId}?project=${encodeURIComponent(project)}`;
    return (
      <Link href={href} className="btn sm">
        Open trace
      </Link>
    );
  }
  if ((step.kind === "explore" || step.kind === "link") && step.href) {
    const label = step.kind === "explore" ? "Open in Explorer" : "Open";
    return (
      <Link href={step.href} className="btn sm">
        {label}
      </Link>
    );
  }
  return null;
}

export function DebugAssistant({ data, project }: { data: DebugContext; project: string }) {
  const [completed, setCompleted] = useState<Set<number>>(() => loadCompleted(data.incidentId, data.playbook));

  useEffect(() => {
    setCompleted(loadCompleted(data.incidentId, data.playbook));
  }, [data.incidentId, data.playbook]);

  const toggleStep = useCallback(
    (step: PlaybookStep) => {
      setCompleted((prev) => {
        const next = new Set(prev);
        const key = stepKey(data.incidentId, step);
        if (next.has(step.priority)) {
          next.delete(step.priority);
          localStorage.removeItem(key);
        } else {
          next.add(step.priority);
          localStorage.setItem(key, "1");
        }
        return next;
      });
    },
    [data.incidentId],
  );

  const total = data.playbook.length;
  const done = data.playbook.filter((s) => completed.has(s.priority)).length;
  const progress = total > 0 ? Math.round((done / total) * 100) : 0;

  return (
    <div className="debug-assistant stack">
      <div className="intel-card debug-context">
        <div className="debug-context__head">
          <div>
            <div className="panel-title" style={{ marginBottom: 6 }}>Investigation context</div>
            <p className="debug-hypothesis">{data.hypothesis || "Analyzing telemetry for root cause…"}</p>
          </div>
          <div className="debug-confidence">
            <span className="hint">Confidence</span>
            <strong>{Math.round((data.confidence ?? 0) * 100)}%</strong>
          </div>
        </div>
        {data.serviceHealth && (
          <div className="debug-metrics">
            <div className="debug-metric">
              <span className="hint">Error rate</span>
              <strong className={data.serviceHealth.errorRate >= 0.05 ? "text-err" : undefined}>
                {fmtPct(data.serviceHealth.errorRate)}
              </strong>
            </div>
            <div className="debug-metric">
              <span className="hint">P95 latency</span>
              <strong>{fmtMs(data.serviceHealth.p95Us)}</strong>
            </div>
            <div className="debug-metric">
              <span className="hint">Throughput</span>
              <strong>{data.serviceHealth.throughputPerMin.toFixed(1)}/min</strong>
            </div>
            <div className="debug-metric">
              <span className="hint">Spans (1h)</span>
              <strong>{data.serviceHealth.spanCount}</strong>
            </div>
          </div>
        )}
      </div>

      <div className="intel-card">
        <div className="panel-title panel-title--split">
          <span>Investigation checklist</span>
          <span className="hint">{done}/{total} complete · {progress}%</span>
        </div>
        <div className="debug-progress" aria-hidden>
          <div className="debug-progress__bar" style={{ width: `${progress}%` }} />
        </div>
        <div className="debug-steps">
          {data.playbook.map((step) => {
            const isDone = completed.has(step.priority);
            return (
              <div key={step.priority} className={`debug-step${isDone ? " debug-step--done" : ""}`}>
                <label className="debug-step__check">
                  <input
                    type="checkbox"
                    checked={isDone}
                    onChange={() => toggleStep(step)}
                  />
                  <span className="debug-step__priority">{step.priority}</span>
                </label>
                <div className="debug-step__body">
                  <div className="debug-step__action">{step.action}</div>
                  {step.rationale && <div className="hint">{step.rationale}</div>}
                  {(step.service || step.operation) && (
                    <div className="debug-step__tags">
                      {step.service && <span className="tag-pill">{step.service}</span>}
                      {step.operation && <span className="tag-pill tag-pill--muted">{step.operation}</span>}
                    </div>
                  )}
                </div>
                <div className="debug-step__cta">
                  <StepAction step={step} project={project} />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {data.evidence.length > 0 && (
        <div className="intel-card">
          <div className="panel-title" style={{ marginBottom: 12 }}>
            Evidence traces
            <span className="hint">{data.evidence.length} samples</span>
          </div>
          <div className="evidence-trace-grid">
            {data.evidence.map((t) => (
              <Link
                key={t.traceId}
                href={`/traces/${t.traceId}?project=${encodeURIComponent(project)}`}
                className={`evidence-trace-link${t.errorCount > 0 ? " evidence-trace-link--err" : ""}`}
              >
                <span className="mono">{t.traceId.slice(0, 18)}…</span>
                <span className="hint">{t.rootService} · {t.rootOperation}</span>
                <span className="hint">
                  {fmtMs(t.durationUs)}
                  {t.errorCount > 0 && <span className="text-err"> · {t.errorCount} errors</span>}
                </span>
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="debug-panels">
        {data.hotspots.length > 0 && (
          <div className="intel-card">
            <div className="panel-title" style={{ marginBottom: 10 }}>Error hotspots</div>
            <div className="stack">
              {data.hotspots.map((h) => (
                <Link
                  key={`${h.service}-${h.operation}`}
                  href={`/explore?project=${encodeURIComponent(project)}&service=${encodeURIComponent(h.service)}&operation=${encodeURIComponent(h.operation)}&onlyErrors=true`}
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
        )}

        {data.deployments.length > 0 && (
          <div className="intel-card">
            <div className="panel-title" style={{ marginBottom: 10 }}>Recent deployments</div>
            <div className="deploy-list">
              {data.deployments.map((d) => (
                <div key={d.id} className="deploy-row">
                  <div>
                    <strong>{d.service}</strong>
                    {d.version && <span className="hint"> v{d.version}</span>}
                  </div>
                  <div className="hint">{new Date(d.deployedAt).toLocaleString()}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {data.impacted?.length > 0 && (
        <div className="intel-card">
          <div className="panel-title" style={{ marginBottom: 10 }}>Downstream impact</div>
          <div className="auto-grid" style={{ "--col-min": "140px" } as React.CSSProperties}>
            {data.impacted.map((s) => (
              <div key={s.service} className="scorecard">
                <div className="svc">{s.service}</div>
                <div className="hint">severity {s.severity}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
