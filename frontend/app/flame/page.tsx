"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchFlameGraph, fetchServices } from "@/lib/api";
import { useProject } from "@/lib/project";
import { useTimeWindow } from "@/lib/time-context";
import type { FlameNode } from "@/lib/types";
import { formatDuration, serviceColor } from "@/lib/format";
import { PageHeader } from "@/components/shell/PageHeader";

const ROW_H = 22;
const W = 1000;

interface FlamePath {
  node: FlameNode;
  path: number[];
}

function FlameSubtree({
  node,
  x,
  width,
  depth,
  rootUs,
  onZoom,
  onHover,
  path,
}: {
  node: FlameNode;
  x: number;
  width: number;
  depth: number;
  rootUs: number;
  onZoom: (p: FlamePath) => void;
  onHover: (n: FlameNode | null) => void;
  path: number[];
}) {
  const color = serviceColor(node.service);
  const label = `${node.name}`;
  const showLabel = width > 60;

  // Lay children out proportionally by totalUs across this node's width.
  const children = node.children ?? [];
  const childTotal = children.reduce((a, c) => a + c.totalUs, 0);
  let cursor = x;

  return (
    <>
      <g
        transform={`translate(${x}, ${depth * ROW_H})`}
        onClick={(e) => { e.stopPropagation(); onZoom({ node, path }); }}
        onMouseEnter={() => onHover(node)}
        onMouseLeave={() => onHover(null)}
        style={{ cursor: "pointer" }}
      >
        <rect
          className="flame-rect"
          width={Math.max(1, width - 1)}
          height={ROW_H - 1}
          rx={2}
          fill={color}
          opacity={0.82}
        />
        {showLabel && (
          <text x={5} y={ROW_H / 2 + 3} fontSize={10} fill="#0b0e10" fontFamily="var(--sans)" style={{ pointerEvents: "none" }}>
            {label.length > width / 6 ? label.slice(0, Math.max(1, Math.floor(width / 6))) + "…" : label}
          </text>
        )}
      </g>
      {children.map((c, i) => {
        const cw = childTotal > 0 ? (c.totalUs / childTotal) * width : 0;
        const cx = cursor;
        cursor += cw;
        return (
          <FlameSubtree
            key={`${c.name}-${i}`}
            node={c}
            x={cx}
            width={cw}
            depth={depth + 1}
            rootUs={rootUs}
            onZoom={onZoom}
            onHover={onHover}
            path={[...path, i]}
          />
        );
      })}
    </>
  );
}

function maxDepth(node: FlameNode): number {
  if (!node.children || node.children.length === 0) return 1;
  return 1 + Math.max(...node.children.map(maxDepth));
}

function nodeAtPath(root: FlameNode, path: number[]): FlameNode {
  let cur = root;
  for (const i of path) {
    cur = cur.children?.[i] ?? cur;
  }
  return cur;
}

export default function FlamePage() {
  const { project } = useProject();
  const { window: win, refreshKey } = useTimeWindow();
  const [services, setServices] = useState<string[]>([]);
  const [service, setService] = useState("");
  const [tree, setTree] = useState<FlameNode | null>(null);
  const [focus, setFocus] = useState<number[]>([]);
  const [hover, setHover] = useState<FlameNode | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchServices(project)
      .then((s) => { setServices(s); if (s.length && !service) setService(s[0]); })
      .catch((e) => setError(String(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project]);

  useEffect(() => {
    if (!service) return;
    setError(null);
    setFocus([]);
    fetchFlameGraph(project, service, undefined, win)
      .then(setTree)
      .catch((e) => setError(String(e)));
  }, [service, win, project, refreshKey]);

  const focusNode = useMemo(() => (tree ? nodeAtPath(tree, focus) : null), [tree, focus]);
  const depth = useMemo(() => (focusNode ? maxDepth(focusNode) : 0), [focusNode]);
  const height = Math.max(ROW_H, depth * ROW_H);

  const zoom = (p: FlamePath) => setFocus(p.path);
  const reset = () => setFocus([]);
  const up = () => setFocus((f) => f.slice(0, -1));

  return (
    <>
      <PageHeader
        title="Flame Graph"
        subtitle={<>Aggregated span self-time by call path · project <code>{project}</code></>}
      />

      <div className="page-body">
        <div className="toolbar">
          <div className="field">
            <label>Service</label>
            <select value={service} onChange={(e) => setService(e.target.value)}>
              <option value="">Select service…</option>
              {services.map((s) => <option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="spacer" />
          <button className="btn ghost" onClick={up} disabled={focus.length === 0}>↑ Up</button>
          <button className="btn ghost" onClick={reset} disabled={focus.length === 0}>Reset zoom</button>
        </div>

        {error && <div className="err-note" style={{ marginBottom: 16 }}>{error}</div>}

        {!service ? (
          <div className="empty"><div className="big">Pick a service to render its flame graph</div></div>
        ) : !tree || !focusNode ? (
          <div className="skeleton" style={{ height: 300 }} />
        ) : (
          <div className="flame-panel">
            <div className="panel-title">
              <span>{focusNode.name} <span className="hint">· {formatDuration(focusNode.totalUs)} total · {focusNode.count.toLocaleString()} spans</span></span>
              <span className="hint">click a frame to zoom</span>
            </div>
            <div style={{ padding: 12, overflowX: "auto" }}>
              <svg viewBox={`0 0 ${W} ${height}`} width="100%" height={height} onClick={reset} style={{ display: "block", minWidth: W }}>
                <FlameSubtree
                  node={focusNode}
                  x={0}
                  width={W}
                  depth={0}
                  rootUs={focusNode.totalUs}
                  onZoom={zoom}
                  onHover={setHover}
                  path={focus}
                />
              </svg>
            </div>
            <div className="flame-tip">
              {hover ? (
                <span className="mono">
                  <span className="swatch" style={{ display: "inline-block", width: 9, height: 9, borderRadius: 2, background: serviceColor(hover.service), marginRight: 6 }} />
                  {hover.service} · {hover.name} — total {formatDuration(hover.totalUs)} · self {formatDuration(hover.selfUs)} · {hover.count.toLocaleString()} spans
                </span>
              ) : (
                <span className="hint">Hover a frame for details</span>
              )}
            </div>
          </div>
        )}
      </div>
    </>
  );
}
