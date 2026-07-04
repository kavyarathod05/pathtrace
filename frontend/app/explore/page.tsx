"use client";

import Link from "next/link";
import { Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  createSavedView,
  deleteSavedView,
  exploreURL,
  fetchOperations,
  fetchSavedViews,
  fetchServices,
  searchTraces,
} from "@/lib/api";
import { useProject } from "@/lib/project";
import type { SavedView, SearchParams, TraceSummary } from "@/lib/types";
import { formatDuration, formatTimeAgo, serviceColor, shortId } from "@/lib/format";

const WINDOWS = ["15m", "1h", "6h", "24h"];

function windowToStart(win: string): string {
  const now = Date.now();
  const mult: Record<string, number> = {
    "15m": 15 * 60_000,
    "1h": 60 * 60_000,
    "6h": 6 * 60 * 60_000,
    "24h": 24 * 60 * 60_000,
  };
  return new Date(now - (mult[win] ?? mult["1h"])).toISOString();
}

function formFromSearch(search: { get: (k: string) => string | null }): SearchParams {
  const next: SearchParams = { limit: 40 };
  const s = search.get("service");
  const op = search.get("operation");
  const minD = search.get("minDuration");
  const maxD = search.get("maxDuration");
  const tags = search.get("tags");
  const q = search.get("q");
  const errs = search.get("onlyErrors");
  if (s) next.service = s;
  if (op) next.operation = op;
  if (minD) next.minDuration = minD;
  if (maxD) next.maxDuration = maxD;
  if (tags) next.tags = tags;
  if (q) next.q = q;
  if (errs === "true") next.onlyErrors = true;
  return next;
}

function hasActiveFilters(form: SearchParams): boolean {
  return !!(
    form.service ||
    form.operation ||
    form.minDuration ||
    form.maxDuration ||
    form.tags ||
    form.q ||
    form.onlyErrors
  );
}

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

function TimeHistogram({ traces }: { traces: TraceSummary[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const { bars, min, bucketMs } = useMemo(() => {
    if (traces.length === 0) return { bars: [] as { count: number; errors: number }[], min: 0, bucketMs: 0 };
    const times = traces.map((t) => new Date(t.startTime).getTime());
    const lo = Math.min(...times);
    const hi = Math.max(...times);
    const span = Math.max(1, hi - lo);
    const N = 32;
    const buckets = Array.from({ length: N }, () => ({ count: 0, errors: 0 }));
    for (const t of traces) {
      const idx = Math.min(N - 1, Math.floor(((new Date(t.startTime).getTime() - lo) / span) * N));
      buckets[idx].count++;
      if (t.errorCount > 0) buckets[idx].errors++;
    }
    return { bars: buckets, min: lo, bucketMs: span / N };
  }, [traces]);

  if (bars.length === 0) return null;
  const max = Math.max(1, ...bars.map((b) => b.count));
  const fmtClock = (ms: number) =>
    new Date(ms).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" });

  return (
    <div className="panel" style={{ marginBottom: 16 }}>
      <div className="panel-title">
        <span>Traces over time</span>
        <span className="hint">count per bucket · errors in red · hover for details</span>
      </div>
      <div className="time-hist">
        {bars.map((b, i) => {
          const from = min + i * bucketMs;
          const to = from + bucketMs;
          const rate = b.count > 0 ? Math.round((b.errors / b.count) * 100) : 0;
          return (
            <div
              key={i}
              className="hist-col"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover((h) => (h === i ? null : h))}
            >
              <div className="hist-bar" style={{ height: `${Math.max(b.count === 0 ? 0 : 3, (b.count / max) * 100)}%` }}>
                {b.errors > 0 && (
                  <span className="hist-err" style={{ height: `${(b.errors / b.count) * 100}%` }} />
                )}
              </div>
              {hover === i && (
                <div className={`hist-tip ${i > bars.length / 2 ? "left" : ""}`}>
                  <div className="hist-tip-time">{fmtClock(from)} – {fmtClock(to)}</div>
                  <div className="hist-tip-row"><span>Traces</span><strong>{b.count}</strong></div>
                  <div className="hist-tip-row"><span>Errors</span><strong className={b.errors > 0 ? "err" : ""}>{b.errors}</strong></div>
                  <div className="hist-tip-row"><span>Error rate</span><strong className={rate > 0 ? "err" : ""}>{rate}%</strong></div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExploreInner() {
  const router = useRouter();
  const search = useSearchParams();
  const { project } = useProject();
  const [services, setServices] = useState<string[]>([]);
  const [operations, setOperations] = useState<string[]>([]);
  const [form, setForm] = useState<SearchParams>(() => formFromSearch(search));
  const [win, setWin] = useState(() => search.get("window") ?? "1h");
  const [results, setResults] = useState<TraceSummary[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [views, setViews] = useState<SavedView[]>([]);
  const [viewName, setViewName] = useState("");

  // Keep form/window in sync when the URL changes (back/forward, shared links).
  useEffect(() => {
    setForm(formFromSearch(search));
    const w = search.get("window");
    if (w) setWin(w);
  }, [search]);

  useEffect(() => {
    fetchServices(project).then(setServices).catch((e) => setError(String(e)));
    fetchSavedViews(project).then(setViews).catch(() => setViews([]));
  }, [project]);

  useEffect(() => {
    if (form.service) {
      fetchOperations(project, form.service).then(setOperations).catch(() => setOperations([]));
    } else {
      setOperations([]);
    }
  }, [form.service, project]);

  const run = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params: SearchParams = { ...form, start: windowToStart(win), end: new Date().toISOString() };
      setResults(await searchTraces(project, params));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [form, win, project]);

  useEffect(() => {
    run();
  }, [run]);

  const syncUrl = () => {
    const url = exploreURL(form);
    const withWin = `${url}${url.includes("?") ? "&" : "?"}window=${win}`;
    router.replace(withWin);
  };

  const submit = () => {
    syncUrl();
    run();
  };

  const saveView = async () => {
    if (!viewName) return;
    try {
      const v = await createSavedView(project, {
        name: viewName,
        kind: "explore",
        params: { ...form, window: win } as Record<string, unknown>,
      });
      setViews((prev) => [v, ...prev]);
      setViewName("");
    } catch (e) {
      setError(String(e));
    }
  };

  const applyView = (v: SavedView) => {
    const p = v.params as SearchParams & { window?: string };
    setForm({
      limit: 40,
      service: p.service,
      operation: p.operation,
      minDuration: p.minDuration,
      maxDuration: p.maxDuration,
      tags: p.tags,
      q: p.q,
      onlyErrors: p.onlyErrors,
    });
    if (p.window) setWin(p.window);
    const url = exploreURL(p);
    router.replace(`${url}${url.includes("?") ? "&" : "?"}window=${p.window ?? win}`);
    setTimeout(run, 0);
  };

  const removeView = async (id: number) => {
    await deleteSavedView(project, id).catch(() => {});
    setViews((prev) => prev.filter((v) => v.id !== id));
  };

  const maxDur = Math.max(1, ...results.map((r) => r.durationUs));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Explore Traces</h1>
          <div className="sub">Project <code>{project}</code> · search with TraceQL and inspect distributed traces</div>
        </div>
        <div className="seg">
          {WINDOWS.map((w) => (
            <button key={w} type="button" className={win === w ? "on" : ""} onClick={() => { setWin(w); setTimeout(submit, 0); }}>Last {w}</button>
          ))}
        </div>
      </div>
      <div className="page-body">
        <div className="toolbar">
          <div className="field grow" style={{ minWidth: 320 }}>
            <label>TraceQL</label>
            <input
              className="mono"
              placeholder={`service="payments" && duration>250ms && error=true`}
              value={form.q ?? ""}
              onChange={(e) => setForm({ ...form, q: e.target.value || undefined })}
              onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
              style={{ width: "100%" }}
            />
          </div>
          <div className="spacer" />
          <button className="btn" onClick={submit} disabled={loading}>{loading ? "Searching…" : "Run query"}</button>
        </div>

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
            <input placeholder="100ms" value={form.minDuration ?? ""} onChange={(e) => setForm({ ...form, minDuration: e.target.value || undefined })} style={{ minWidth: 100 }} />
          </div>
          <div className="field">
            <label>Max duration</label>
            <input placeholder="2s" value={form.maxDuration ?? ""} onChange={(e) => setForm({ ...form, maxDuration: e.target.value || undefined })} style={{ minWidth: 100 }} />
          </div>
          <div className="field">
            <label>Tags</label>
            <input placeholder="http.route=POST /checkout" value={form.tags ?? ""} onChange={(e) => setForm({ ...form, tags: e.target.value || undefined })} style={{ minWidth: 200 }} />
          </div>
          <label className="check">
            <input type="checkbox" checked={!!form.onlyErrors} onChange={(e) => setForm({ ...form, onlyErrors: e.target.checked })} />
            Errors only
          </label>
          <div className="spacer" />
          <button className="btn ghost" onClick={submit} disabled={loading}>Apply filters</button>
        </div>

        <div className="toolbar">
          <div className="field grow">
            <label>Save current view</label>
            <input placeholder="Slow payments" value={viewName} onChange={(e) => setViewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") saveView(); }} />
          </div>
          <button className="btn ghost" onClick={saveView} disabled={!viewName}>Save view</button>
          <div className="spacer" />
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center" }}>
            {views.length === 0 && <span className="hint">No saved views yet</span>}
            {views.map((v) => (
              <span key={v.id} className="chip" style={{ cursor: "pointer" }}>
                <span onClick={() => applyView(v)}>{v.name}</span>
                <span style={{ marginLeft: 4, color: "var(--err)", cursor: "pointer" }} onClick={() => removeView(v.id)} title="Delete view">×</span>
              </span>
            ))}
          </div>
        </div>

        {error && <div className="err-note" style={{ marginBottom: 16 }}>{error}</div>}

        {results.length > 0 && <TimeHistogram traces={results} />}
        {results.length > 0 && (
          <DurationScatter traces={results} maxDur={maxDur} onPick={(id) => router.push(`/traces/${id}`)} />
        )}

        <div className="panel">
          <div className="panel-title"><span>Results</span><span className="hint">{results.length} traces</span></div>
          {results.length === 0 && !loading ? (
            <div className="empty">
              <div className="big">No traces found</div>
              {hasActiveFilters(form) ? (
                <>
                  No traces match the current filters in the selected time window.
                  Try clearing the TraceQL query, tag filter, or duration bounds, or widen the time range.
                </>
              ) : (
                <>
                  Try the demo project or <Link href="/connect" className="link">connect your app</Link> to start sending spans.
                </>
              )}
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

export default function ExplorePage() {
  return (
    <Suspense fallback={<div className="page-body"><div className="skeleton" style={{ height: 120 }} /></div>}>
      <ExploreInner />
    </Suspense>
  );
}
