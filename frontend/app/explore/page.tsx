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
import { useTimeWindow } from "@/lib/time-context";
import type { SavedView, SearchParams, TraceSummary } from "@/lib/types";
import { formatDuration, serviceColor } from "@/lib/format";
import { PageHeader } from "@/components/shell/PageHeader";
import { ExploreFilters } from "@/components/explore/ExploreFilters";
import { TraceList } from "@/components/explore/TraceList";
import { TracePreview } from "@/components/explore/TracePreview";

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

function DurationScatter({
  traces,
  maxDur,
  selectedId,
  onPick,
}: {
  traces: TraceSummary[];
  maxDur: number;
  selectedId: string | null;
  onPick: (id: string) => void;
}) {
  if (traces.length === 0) return null;
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  return (
    <div className="panel explore-chart">
      <div className="panel-title">
        <span>Duration distribution</span>
        <span className="hint">{traces.length} traces</span>
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
          const sel = selectedId === t.traceId;
          return (
            <button
              key={t.traceId}
              type="button"
              className={`dot${sel ? " selected" : ""}`}
              title={`${t.rootService} · ${formatDuration(t.durationUs)}`}
              style={{
                left: `${x}%`,
                bottom: `${y}%`,
                background: err ? "var(--err)" : serviceColor(t.rootService),
                boxShadow: sel ? "0 0 0 2px var(--accent-hi)" : err ? "0 0 0 2px var(--err-bg)" : undefined,
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
    const N = 24;
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
    <div className="panel explore-chart">
      <div className="panel-title">
        <span>Traces over time</span>
        <span className="hint">hover for details</span>
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
  const { range, refreshKey } = useTimeWindow();
  const [services, setServices] = useState<string[]>([]);
  const [operations, setOperations] = useState<string[]>([]);
  const [form, setForm] = useState<SearchParams>(() => formFromSearch(search));
  const [results, setResults] = useState<TraceSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [views, setViews] = useState<SavedView[]>([]);
  const [viewName, setViewName] = useState("");

  useEffect(() => {
    setForm(formFromSearch(search));
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
      const params: SearchParams = { ...form, start: range.start, end: range.end };
      const traces = await searchTraces(project, params);
      setResults(traces);
      setSelectedId((prev) => (prev && traces.some((t) => t.traceId === prev) ? prev : traces[0]?.traceId ?? null));
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  }, [form, range.start, range.end, project, refreshKey]);

  useEffect(() => {
    run();
  }, [run]);

  const syncUrl = () => {
    const url = exploreURL(form);
    const w = search.get("window");
    const withWin = w ? `${url}${url.includes("?") ? "&" : "?"}window=${w}` : url;
    router.replace(withWin, { scroll: false });
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
        params: { ...form } as Record<string, unknown>,
      });
      setViews((prev) => [v, ...prev]);
      setViewName("");
    } catch (e) {
      setError(String(e));
    }
  };

  const applyView = (v: SavedView) => {
    const p = v.params as SearchParams;
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
    const url = exploreURL(p);
    router.replace(url, { scroll: false });
    setTimeout(run, 0);
  };

  const removeView = async (id: number) => {
    await deleteSavedView(project, id).catch(() => {});
    setViews((prev) => prev.filter((v) => v.id !== id));
  };

  const selectedSummary = results.find((t) => t.traceId === selectedId) ?? null;
  const maxDur = Math.max(1, ...results.map((r) => r.durationUs));

  return (
    <>
      <PageHeader
        title="Explore Traces"
        subtitle={<>Search with TraceQL and inspect distributed traces · project <code>{project}</code></>}
      />

      <div className="explore-layout">
        <ExploreFilters
          form={form}
          setForm={setForm}
          services={services}
          operations={operations}
          views={views}
          viewName={viewName}
          setViewName={setViewName}
          onApply={submit}
          onSaveView={saveView}
          onApplyView={applyView}
          onRemoveView={removeView}
          loading={loading}
        />

        <div className="explore-center">
          {error && <div className="err-note" style={{ marginBottom: 12 }}>{error}</div>}

          {results.length > 0 && (
            <div className="explore-charts">
              <TimeHistogram traces={results} />
              <DurationScatter
                traces={results}
                maxDur={maxDur}
                selectedId={selectedId}
                onPick={setSelectedId}
              />
            </div>
          )}

          <TraceList
            traces={results}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onOpen={(id) => router.push(`/traces/${id}`)}
            loading={loading}
          />
        </div>

        <TracePreview project={project} summary={selectedSummary} />
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
