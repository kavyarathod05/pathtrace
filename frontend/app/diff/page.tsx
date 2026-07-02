"use client";

import { useState } from "react";
import Link from "next/link";
import { fetchTrace } from "@/lib/api";
import { useProject } from "@/lib/project";
import type { Trace } from "@/lib/types";
import { formatDuration, serviceColor } from "@/lib/format";
import { buildLayout } from "@/lib/trace";

export default function DiffPage() {
  const { project } = useProject();
  const [aId, setAId] = useState("");
  const [bId, setBId] = useState("");
  const [a, setA] = useState<Trace | null>(null);
  const [b, setB] = useState<Trace | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setError(null);
    setLoading(true);
    try {
      const [ta, tb] = await Promise.all([fetchTrace(project, aId.trim()), fetchTrace(project, bId.trim())]);
      setA(ta);
      setB(tb);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  const layoutA = a ? buildLayout(a) : null;
  const layoutB = b ? buildLayout(b) : null;
  const opsA = new Map(layoutA?.rows.map((r) => [`${r.span.serviceName}/${r.span.operationName}`, r.span.durationUs]) ?? []);
  const opsB = new Map(layoutB?.rows.map((r) => [`${r.span.serviceName}/${r.span.operationName}`, r.span.durationUs]) ?? []);
  const allOps = [...new Set([...opsA.keys(), ...opsB.keys()])].sort();

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Trace Diff</h1>
          <div className="sub">Compare duration per operation across two traces</div>
        </div>
      </div>
      <div className="page-body">
        <div className="toolbar">
          <div className="field"><label>Trace A</label><input value={aId} onChange={(e) => setAId(e.target.value)} placeholder="trace id" style={{ minWidth: 280, fontFamily: "var(--mono)" }} /></div>
          <div className="field"><label>Trace B</label><input value={bId} onChange={(e) => setBId(e.target.value)} placeholder="trace id" style={{ minWidth: 280, fontFamily: "var(--mono)" }} /></div>
          <button className="btn" onClick={load} disabled={loading || !aId.trim() || !bId.trim()}>{loading ? "Loading…" : "Compare"}</button>
        </div>
        {error && <div className="err-note" style={{ marginBottom: 16 }}>{error}</div>}

        {a && b && (
          <>
            <div className="stat-strip" style={{ marginBottom: 16 }}>
              <div className="stat"><div className="k">Trace A</div><div className="v accent">{formatDuration(a.summary.durationUs)}</div></div>
              <div className="stat"><div className="k">Trace B</div><div className="v accent">{formatDuration(b.summary.durationUs)}</div></div>
              <div className="stat"><div className="k">Delta</div><div className={`v${b.summary.durationUs > a.summary.durationUs ? " err" : ""}`}>{formatDuration(Math.abs(b.summary.durationUs - a.summary.durationUs))}{b.summary.durationUs > a.summary.durationUs ? " slower" : " faster"}</div></div>
            </div>

            <div className="toprow">
              <Link href={`/traces/${a.traceId}`} className="link">Open trace A</Link>
              <span className="hint">·</span>
              <Link href={`/traces/${b.traceId}`} className="link">Open trace B</Link>
            </div>

            <div className="panel">
              <table>
                <thead>
                  <tr><th>Operation</th><th className="num">Trace A</th><th className="num">Trace B</th><th className="num">Delta</th></tr>
                </thead>
                <tbody>
                  {allOps.map((op) => {
                    const da = opsA.get(op) ?? 0;
                    const db = opsB.get(op) ?? 0;
                    const delta = db - da;
                    const svc = op.split("/")[0];
                    return (
                      <tr key={op}>
                        <td>
                          <span className="svc-tag">
                            <span className="swatch" style={{ background: serviceColor(svc) }} />
                            <code>{op}</code>
                          </span>
                        </td>
                        <td className="num">{da ? formatDuration(da) : "—"}</td>
                        <td className="num">{db ? formatDuration(db) : "—"}</td>
                        <td className="num" style={{ color: delta > 0 ? "var(--warn)" : delta < 0 ? "var(--ok)" : undefined }}>
                          {da && db ? `${formatDuration(Math.abs(delta))}${delta > 0 ? " slower" : delta < 0 ? " faster" : ""}` : "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </>
  );
}
