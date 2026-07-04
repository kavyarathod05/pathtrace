"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { fetchDependencies, fetchServiceHealth } from "@/lib/api";
import { useProject } from "@/lib/project";
import { useTimeWindow } from "@/lib/time-context";
import type { DependencyEdge, ServiceHealth } from "@/lib/types";
import { formatDuration, formatPercent, serviceColor } from "@/lib/format";
import { PageHeader } from "@/components/shell/PageHeader";

interface Node {
  id: string;
  x: number;
  y: number;
  level: number;
  calls: number;
  errors: number;
  health?: ServiceHealth;
}

const NODE_W = 180;
const NODE_H = 58;
const COL_GAP = 130;
const ROW_GAP = 32;
const PAD = 52;

function layoutNodes(
  edges: DependencyEdge[],
  healthMap: Map<string, ServiceHealth>,
): { nodes: Map<string, Node>; width: number; height: number } {
  const ids = new Set<string>();
  const incoming = new Map<string, number>();
  const stats = new Map<string, { calls: number; errors: number }>();
  for (const e of edges) {
    ids.add(e.parent);
    ids.add(e.child);
    incoming.set(e.child, (incoming.get(e.child) ?? 0) + 1);
    stats.set(e.parent, {
      calls: (stats.get(e.parent)?.calls ?? 0) + e.callCount,
      errors: (stats.get(e.parent)?.errors ?? 0) + e.errorCount,
    });
    stats.set(e.child, {
      calls: (stats.get(e.child)?.calls ?? 0) + e.callCount,
      errors: (stats.get(e.child)?.errors ?? 0) + e.errorCount,
    });
  }
  const level = new Map<string, number>();
  for (const id of ids) level.set(id, incoming.get(id) ? -1 : 0);
  let changed = true;
  let guard = 0;
  while (changed && guard++ < 100) {
    changed = false;
    for (const e of edges) {
      const pl = level.get(e.parent) ?? 0;
      const base = pl < 0 ? 0 : pl;
      const want = base + 1;
      if ((level.get(e.child) ?? -1) < want) {
        level.set(e.child, want);
        changed = true;
      }
    }
  }
  for (const id of ids) if ((level.get(id) ?? -1) < 0) level.set(id, 0);

  const byLevel = new Map<number, string[]>();
  for (const id of ids) {
    const l = level.get(id) ?? 0;
    if (!byLevel.has(l)) byLevel.set(l, []);
    byLevel.get(l)!.push(id);
  }

  const nodes = new Map<string, Node>();
  let maxRows = 0;
  const levels = [...byLevel.keys()].sort((a, b) => a - b);
  for (const l of levels) {
    const col = byLevel.get(l)!.sort();
    maxRows = Math.max(maxRows, col.length);
    col.forEach((id, i) => {
      const st = stats.get(id) ?? { calls: 0, errors: 0 };
      nodes.set(id, {
        id,
        level: l,
        x: PAD + l * (NODE_W + COL_GAP),
        y: PAD + i * (NODE_H + ROW_GAP),
        calls: st.calls,
        errors: st.errors,
        health: healthMap.get(id),
      });
    });
  }
  const width = PAD * 2 + levels.length * (NODE_W + COL_GAP) - COL_GAP;
  const height = PAD * 2 + maxRows * (NODE_H + ROW_GAP) - ROW_GAP;
  return { nodes, width: Math.max(width, 520), height: Math.max(height, 260) };
}

function healthClass(h?: ServiceHealth): string {
  if (!h) return "";
  if (h.errorRate > 0.05) return "critical";
  if (h.errorRate > 0.01) return "degraded";
  return "healthy";
}

export default function ServiceMapPage() {
  const { project } = useProject();
  const { window, refreshKey } = useTimeWindow();
  const [edges, setEdges] = useState<DependencyEdge[]>([]);
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hover, setHover] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    Promise.all([fetchDependencies(project, window), fetchServiceHealth(project, window)])
      .then(([e, h]) => {
        setEdges(e);
        setHealth(h);
      })
      .catch((e) => setError(String(e)));
  }, [window, project, refreshKey]);

  const healthMap = useMemo(() => new Map(health.map((h) => [h.service, h])), [health]);
  const { nodes, width, height } = useMemo(
    () => layoutNodes(edges, healthMap),
    [edges, healthMap],
  );

  const connected = (id: string) => {
    if (!hover) return true;
    return edges.some(
      (e) =>
        (e.parent === hover && e.child === id) ||
        (e.child === hover && e.parent === id) ||
        id === hover,
    );
  };

  return (
    <>
      <PageHeader
        title="Service Map"
        subtitle={<>Call dependencies and health · project <code>{project}</code></>}
      />

      <div className="page-body">
        {error && <div className="err-note" style={{ marginBottom: 16 }}>{error}</div>}
        {edges.length === 0 ? (
          <div className="empty">
            <div className="big">No dependencies in this window</div>
            Send multi-service traces to populate the graph.
          </div>
        ) : (
          <div className="map-wrap map-wrap-enhanced">
            <div className="map-legend">
              <span><span className="map-legend-dot healthy" /> Healthy</span>
              <span><span className="map-legend-dot degraded" /> Degraded</span>
              <span><span className="map-legend-dot critical" /> Critical</span>
            </div>
            <svg width={width} height={height} style={{ display: "block", minWidth: "100%" }}>
              <defs>
                <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="var(--border-strong)" />
                </marker>
                <marker id="arrow-err" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">
                  <path d="M0,0 L8,4 L0,8 Z" fill="var(--err)" />
                </marker>
                <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
                  <feGaussianBlur stdDeviation="2" result="blur" />
                  <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
                </filter>
              </defs>

              {edges.map((e, i) => {
                const a = nodes.get(e.parent);
                const b = nodes.get(e.child);
                if (!a || !b) return null;
                const x1 = a.x + NODE_W;
                const y1 = a.y + NODE_H / 2;
                const x2 = b.x;
                const y2 = b.y + NODE_H / 2;
                const mx = (x1 + x2) / 2;
                const hasErr = e.errorCount > 0;
                const dim = hover && !connected(e.parent) && !connected(e.child);
                return (
                  <g key={i} opacity={dim ? 0.12 : 1}>
                    <path
                      className={`map-edge${hasErr ? " err" : ""}`}
                      d={`M${x1},${y1} C${mx},${y1} ${mx},${y2} ${x2 - 8},${y2}`}
                      markerEnd={hasErr ? "url(#arrow-err)" : "url(#arrow)"}
                      strokeWidth={Math.min(6, 1.4 + Math.log10(Math.max(1, e.callCount)))}
                    />
                    <rect className="map-edge-label-bg" x={mx - 32} y={(y1 + y2) / 2 - 16} width={64} height={14} rx={3} opacity={0.92} />
                    <text className="map-edge-label" x={mx} y={(y1 + y2) / 2 - 6} textAnchor="middle">
                      {e.callCount}{hasErr ? ` · ${e.errorCount} err` : ""}
                    </text>
                  </g>
                );
              })}

              {[...nodes.values()].map((n) => {
                const color = serviceColor(n.id);
                const active = hover === n.id;
                const dim = hover && !connected(n.id);
                const errRate = n.calls ? n.errors / n.calls : 0;
                const hc = healthClass(n.health);
                const p95 = n.health ? formatDuration(n.health.p95Us) : null;
                return (
                  <Link key={n.id} href={`/explore?service=${encodeURIComponent(n.id)}&window=${window}`}>
                    <g
                      className={`map-node map-node-${hc}`}
                      transform={`translate(${n.x},${n.y})`}
                      opacity={dim ? 0.2 : 1}
                      onMouseEnter={() => setHover(n.id)}
                      onMouseLeave={() => setHover(null)}
                      filter={active ? "url(#glow)" : undefined}
                      style={{ cursor: "pointer" }}
                    >
                      <rect className="body" width={NODE_W} height={NODE_H} rx={8} stroke={active ? color : undefined} strokeWidth={active ? 2 : 1} />
                      <rect width={6} height={NODE_H} rx={4} fill={color} />
                      <circle className={`health-ring ${hc}`} cx={NODE_W - 14} cy={14} r={5} />
                      <text className="title" x={26} y={22}>{n.id.length > 16 ? n.id.slice(0, 14) + "…" : n.id}</text>
                      <text className="sub" x={26} y={38}>{n.calls.toLocaleString()} calls{n.errors ? ` · ${formatPercent(errRate)} err` : ""}</text>
                      {p95 && <text className="sub p95" x={26} y={52}>p95 {p95}</text>}
                    </g>
                  </Link>
                );
              })}
            </svg>
          </div>
        )}
      </div>
    </>
  );
}
