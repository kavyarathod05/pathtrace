"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { fetchOperations, fetchServices, searchTraces } from "@/lib/api";
import { useProject } from "@/lib/project";
import type { SearchParams, TraceSummary } from "@/lib/types";
import { formatDuration, formatTimeAgo, serviceColor, shortId } from "@/lib/format";

function DurationScatter({ traces, maxDur, onPick }: { traces: TraceSummary[]; maxDur: number; onPick: (id: string) => void }) {
  if (traces.length === 0) return null;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-title">
        <span>Duration distribution</span>
        <span className="hint">{traces.length} traces · click a dot to open</span>
      </div>
      <div className="scatter">
        <div className="yaxis">
          {ticks.map((t) => (
            <div key={t} className="gl" style={{ bottom: `${t * 100}%` }}>
              <span className="lbl">{formatDuration(maxDur * t)}</span>
            </div>
          ))}
        </div>
        {traces.map((t, i) => {
          const x = traces.length > 1 ? (i / (traces.length - 1)) * 100 : 50;
          const y = (t.durationUs / maxDur) * 100;
          const err = t.errorCount > 0;
          return (
            <button
              key={t.traceId}
              type="button"
              className="dot"
              title={`${t.rootService} · ${formatDuration(t.durationUs)}`}
              style={{
                left: `${x}%`,
                bottom: `${y}%`,
                background: err ? "var(--err)" : serviceColor(t.rootService),
                boxShadow: err ? "0 0 0 2px var(--err-bg)" : undefined,
              }}
              onClick={() => onPick(t.traceId)}
            />
          );
        })}
      </div>
    </div>
  );
}

export default function ExplorePage() {
  const router = useRouter();
  const { project } = useProject();
  const [services, setServices] = useState<string[]>([]);
  const [operations, setOperations] = useState<string[]>([]);
  const [form, setForm] = useState<SearchParams>({ limit: 40 });
  const [results, setResults] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchServices(project).then(setServices).catch((e) => setError(String(e)));
  }, [project]);

  useEffect(() => {
    if (form.service) {
      fetchOperations(project, form.service).then(setOperations).catch(() => setOperations([]));
    } else {
      setOperations([]);
    }
  }, [form.service, project]);

  const run = async () => {
    setLoading(true);
    setError(null);
    try {
      setResults(await searchTraces(project, form));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  const maxDur = Math.max(1, ...results.map((r) => r.durationUs));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Explore Traces</h1>
          <div className="sub">Project <code>{project}</code> · search and inspect distributed traces</div>
        </div>
      </div>
      <div className="page-body">
        <div className="toolbar">
          <div className="field">
            <label>Service</label>
            <select value={form.service ?? ""} onChange={(e) => setForm({ ...form, service: e.target.value || undefined, operation: undefined })}>
              <option value="">All services</option>
              {services.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Operation</label>
            <select value={form.operation ?? ""} onChange={(e) => setForm({ ...form, operation: e.target.value || undefined })} disabled={!form.service}>
              <option value="">All operations</option>
              {operations.map((o) => <option key={o} value={o}>{o}</option>)}
            </select>
          </div>
          <div className="field">
            <label>Min duration</label>
            <input placeholder="100ms" value={form.minDuration ?? ""} onChange={(e) => setForm({ ...form, minDuration: e.target.value || undefined })} style={{ minWidth: 110 }} />
          </div>
          <div className="field">
            <label>Tags</label>
            <input placeholder="http.route=POST /checkout" value={form.tags ?? ""} onChange={(e) => setForm({ ...form, tags: e.target.value || undefined })} style={{ minWidth: 220 }} />
          </div>
          <label className="check">
            <input type="checkbox" checked={!!form.onlyErrors} onChange={(e) => setForm({ ...form, onlyErrors: e.target.checked })} />
            Errors only
          </label>
          <div className="spacer" />
          <button className="btn" onClick={run} disabled={loading}>{loading ? "Searching…" : "Search"}</button>
        </div>

        {error && <div className="err-note" style={{ marginBottom: 16 }}>{error}</div>}

        {results.length > 0 && (
          <DurationScatter traces={results} maxDur={maxDur} onPick={(id) => router.push(`/traces/${id}`)} />
        )}

        <div className="panel">
          <div className="panel-title"><span>Results</span><span className="hint">{results.length} traces</span></div>
          {results.length === 0 && !loading ? (
            <div className="empty">
              <div className="big">No traces found</div>
              Try the demo project or <Link href="/connect" className="link">connect your app</Link> to start sending spans.
            </div>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Trace ID</th><th>Root span</th><th>Services</th>
                  <th className="num">Spans</th><th className="num">Errors</th><th>Duration</th><th className="num">When</th>
                </tr>
              </thead>
              <tbody>
                {results.map((t) => (
                  <tr key={t.traceId} className="clickable" onClick={() => router.push(`/traces/${t.traceId}`)}>
                    <td><code>{shortId(t.traceId, 14)}</code></td>
                    <td>
                      <span className="svc-tag">
                        <span className="swatch" style={{ background: serviceColor(t.rootService) }} />
                        <strong>{t.rootService}</strong>
                      </span>
                      <div className="hint">{t.rootOperation}</div>
                    </td>
                    <td>
                      {t.services.slice(0, 8).map((s) => (
                        <span key={s} title={s} className="swatch" style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: serviceColor(s), marginRight: 3 }} />
                      ))}
                    </td>
                    <td className="num">{t.spanCount}</td>
                    <td className="num">{t.errorCount > 0 ? <span className="badge-err">{t.errorCount}</span> : "0"}</td>
                    <td><code>{formatDuration(t.durationUs)}</code></td>
                    <td className="num hint">{formatTimeAgo(t.startTime)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </>
  );
}
