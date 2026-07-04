"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import type { Span } from "@/lib/types";
import { formatDuration, serviceColor } from "@/lib/format";
import { formatAxisTime, type LayoutSpan, type TraceLayout } from "@/lib/trace";

interface WaterfallProps {
  layout: TraceLayout;
  selectedId?: string;
  onSelect: (span: Span) => void;
  collapsed: Set<string>;
  onToggle: (spanId: string) => void;
  childrenOf: Map<string, string[]>;
}

export function Waterfall({
  layout,
  selectedId,
  onSelect,
  collapsed,
  onToggle,
  childrenOf,
}: WaterfallProps) {
  const [viewStart, setViewStart] = useState(0);
  const [viewEnd, setViewEnd] = useState(1);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const trackRef = useRef<HTMLDivElement>(null);

  const visibleRows = useMemo(() => filterVisible(layout.rows, collapsed, childrenOf), [layout, collapsed, childrenOf]);

  const viewRangeUs = layout.totalUs * (viewEnd - viewStart);
  const viewOffsetUs = layout.totalUs * viewStart;

  const toPct = (offsetUs: number, durUs: number) => {
    const left = ((offsetUs - viewOffsetUs) / viewRangeUs) * 100;
    const width = (durUs / viewRangeUs) * 100;
    return { left: Math.max(0, left), width: Math.max(0.35, width) };
  };

  const services = useMemo(() => {
    const s = new Set<string>();
    for (const r of layout.rows) s.add(r.span.serviceName);
    return [...s];
  }, [layout]);

  const onWheel = useCallback((e: React.WheelEvent) => {
    if (!e.ctrlKey && !e.metaKey) return;
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.1 : -0.1;
    const span = viewEnd - viewStart;
    const next = Math.min(1, Math.max(0.05, span + delta * span));
    const mid = (viewStart + viewEnd) / 2;
    setViewStart(Math.max(0, mid - next / 2));
    setViewEnd(Math.min(1, mid + next / 2));
  }, [viewStart, viewEnd]);

  const ticks = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="wf-enhanced" onWheel={onWheel}>
      {/* Minimap */}
      <div className="wf-minimap">
        <div className="wf-minimap-track">
          {layout.rows.map((r) => {
            const left = (r.offsetUs / layout.totalUs) * 100;
            const width = (r.span.durationUs / layout.totalUs) * 100;
            return (
              <div
                key={r.span.spanId}
                className="wf-mini-bar"
                style={{
                  left: `${left}%`,
                  width: `${Math.max(0.5, width)}%`,
                  background: serviceColor(r.span.serviceName),
                  opacity: r.onCriticalPath ? 1 : 0.4,
                }}
              />
            );
          })}
          <div
            className="wf-brush"
            style={{ left: `${viewStart * 100}%`, width: `${(viewEnd - viewStart) * 100}%` }}
          />
        </div>
        <div className="wf-zoom-btns">
          <button type="button" className="btn ghost" onClick={() => { setViewStart(0); setViewEnd(1); }}>Reset</button>
          <button type="button" className="btn ghost" onClick={() => {
            const mid = (viewStart + viewEnd) / 2;
            const span = Math.max(0.05, (viewEnd - viewStart) * 0.7);
            setViewStart(Math.max(0, mid - span / 2));
            setViewEnd(Math.min(1, mid + span / 2));
          }}>Zoom in</button>
        </div>
      </div>

      {/* Service legend */}
      <div className="wf-legend">
        {services.map((svc) => (
          <span key={svc} className="svc-tag" style={{ fontSize: 11 }}>
            <span className="swatch" style={{ background: serviceColor(svc) }} />
            {svc}
          </span>
        ))}
      </div>

      <div className="wf">
        <div className="wf-head">
          <div className="wf-head-label">
            <span>Span</span>
            <span className="hint">{visibleRows.length} visible · scroll+ctrl to zoom</span>
          </div>
          <div className="wf-head-axis sticky-axis">
            {ticks.map((t) => (
              <div key={t} className="wf-tick" style={{ left: `${t * 100}%` }}>
                <div className="rule" />
                <span className="lbl">{formatAxisTime(viewOffsetUs + viewRangeUs * t)}</span>
              </div>
            ))}
          </div>
        </div>

        <div
          className="wf-body"
          ref={trackRef}
          onMouseMove={(e) => {
            const body = trackRef.current;
            if (!body) return;
            const grid = body.querySelector(".wf-gridlines") as HTMLElement | null;
            if (!grid) return;
            const rect = grid.getBoundingClientRect();
            if (rect.width <= 0) return;
            const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
            setHoverX(pct * 100);
          }}
          onMouseLeave={() => setHoverX(null)}
        >
          <div className="wf-gridlines">
            {ticks.map((t) => (
              <div key={t} className="gl" style={{ left: `${t * 100}%` }} />
            ))}
            {hoverX !== null && (
              <div className="wf-crosshair" style={{ left: `${hoverX}%` }}>
                <span className="wf-crosshair-tip">{formatAxisTime(viewOffsetUs + viewRangeUs * (hoverX / 100))}</span>
              </div>
            )}
          </div>

          {visibleRows.map((row) => (
            <WaterfallRow
              key={row.span.spanId}
              row={row}
              selected={selectedId === row.span.spanId}
              kids={childrenOf.get(row.span.spanId) ?? []}
              collapsed={collapsed.has(row.span.spanId)}
              barStyle={toPct(row.offsetUs, row.span.durationUs)}
              onSelect={() => onSelect(row.span)}
              onToggle={() => onToggle(row.span.spanId)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

function WaterfallRow({
  row,
  selected,
  kids,
  collapsed,
  barStyle,
  onSelect,
  onToggle,
}: {
  row: LayoutSpan;
  selected: boolean;
  kids: string[];
  collapsed: boolean;
  barStyle: { left: number; width: number };
  onSelect: () => void;
  onToggle: () => void;
}) {
  const { span, depth, onCriticalPath, selfUs } = row;
  const isErr = span.statusCode === "ERROR";
  const color = serviceColor(span.serviceName);
  const selfPct = span.durationUs > 0 ? (selfUs / span.durationUs) * 100 : 100;

  return (
    <div className={`wf-row${selected ? " selected" : ""}${onCriticalPath ? " critical" : ""}`} onClick={onSelect}>
      <div className="wf-label" style={{ paddingLeft: 8 + depth * 16 }}>
        <span className="strip" style={{ background: color, opacity: onCriticalPath ? 1 : 0.45 }} />
        <button
          type="button"
          className={`wf-caret${kids.length ? "" : " leaf"}`}
          onClick={(e) => { e.stopPropagation(); if (kids.length) onToggle(); }}
        >
          {kids.length ? (collapsed ? "▸" : "▾") : ""}
        </button>
        <span className="op">{span.operationName}</span>
        <span className="svc">· {span.serviceName}</span>
        {onCriticalPath && <span className="crit-dot" title="Critical path" />}
      </div>
      <div className="wf-track">
        <div
          className={`wf-bar-wrap${onCriticalPath ? " critical" : ""}`}
          style={{ left: `${barStyle.left}%`, width: `${barStyle.width}%` }}
          onClick={(e) => e.stopPropagation()}
        >
          <div
            className={`wf-bar${isErr ? " err" : ""}`}
            style={{
              background: `linear-gradient(90deg, ${color} ${selfPct}%, ${color}88 ${selfPct}%)`,
              opacity: onCriticalPath ? 0.95 : 0.72,
            }}
          />
          {barStyle.width >= 10 && (
            <span className="wf-bar-label">{formatDuration(span.durationUs)}</span>
          )}
          <div className={`wf-bar-tip${depth < 2 ? " below" : ""}`} role="tooltip">
            <div className="wf-tip-title">{span.operationName}</div>
            <div className="wf-tip-sub">
              <span className="swatch" style={{ background: color }} />
              {span.serviceName}
              {span.kind ? ` · ${span.kind}` : ""}
            </div>
            <div className="wf-tip-grid">
              <span>Duration</span><strong>{formatDuration(span.durationUs)}</strong>
              <span>Self time</span><strong>{formatDuration(selfUs)}</strong>
              <span>Start</span><strong>{formatAxisTime(row.offsetUs)}</strong>
              <span>Status</span>
              <strong className={isErr ? "err" : ""}>{isErr ? (span.statusMessage || "ERROR") : "OK"}</strong>
            </div>
          </div>
        </div>
        {barStyle.width < 10 && (
          <span
            className="wf-dur-outside"
            style={{ left: `calc(${barStyle.left + barStyle.width}% + 6px)` }}
          >
            {formatDuration(span.durationUs)}
          </span>
        )}
      </div>
    </div>
  );
}

function filterVisible(rows: LayoutSpan[], collapsed: Set<string>, childrenOf: Map<string, string[]>) {
  const hidden = new Set<string>();
  const hideDesc = (spanId: string) => {
    for (const c of childrenOf.get(spanId) ?? []) {
      hidden.add(c);
      hideDesc(c);
    }
  };
  for (const id of collapsed) hideDesc(id);

  return rows.filter((r) => {
    let p = r.span.parentSpanId;
    while (p) {
      if (hidden.has(p)) return false;
      const parent = rows.find((x) => x.span.spanId === p);
      p = parent?.span.parentSpanId;
    }
    return !hidden.has(r.span.spanId);
  });
}
