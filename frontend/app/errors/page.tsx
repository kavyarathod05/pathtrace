"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchErrorGroup, fetchErrorGroups } from "@/lib/api";
import { useProject } from "@/lib/project";
import type { ErrorGroup } from "@/lib/types";
import { formatTimeAgo, serviceColor, shortId } from "@/lib/format";

export default function ErrorsPage() {
  const { project } = useProject();
  const [win, setWin] = useState("1h");
  const [groups, setGroups] = useState<ErrorGroup[]>([]);
  const [selected, setSelected] = useState<ErrorGroup | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetchErrorGroups(project, win)
      .then((g) => {
        setGroups(g);
        setSelected(null);
      })
      .catch((e) => setError(String(e)));
  }, [project, win]);

  const drill = (g: ErrorGroup) => {
    setSelected(g);
    fetchErrorGroup(project, g.fingerprint, win).then(setSelected).catch(() => setSelected(g));
  };

  const maxCount = Math.max(1, ...groups.map((g) => g.count));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Error Groups</h1>
          <div className="sub">Exceptions grouped by fingerprint · project <code>{project}</code></div>
        </div>
        <div className="seg">
          {["15m", "1h", "6h", "24h"].map((w) => (
            <button key={w} type="button" className={win === w ? "on" : ""} onClick={() => setWin(w)}>Last {w}</button>
          ))}
        </div>
      </div>

      <div className="page-body">
        {error && <div className="err-note" style={{ marginBottom: 16 }}>{error}</div>}

        <div className="row-gap">
          <div className="grow">
            <div className="panel">
              <div className="panel-title"><span>Groups</span><span className="hint">{groups.length}</span></div>
              {groups.length === 0 ? (
                <div className="empty"><div className="big">No errors in this window</div>Nothing is failing — nice.</div>
              ) : (
                <table>
                  <thead>
                    <tr><th>Error</th><th>Service · Operation</th><th style={{ width: "22%" }}>Volume</th><th className="num">Count</th><th className="num">Last seen</th></tr>
                  </thead>
                  <tbody>
                    {groups.map((g) => (
                      <tr key={g.fingerprint} className={`clickable${selected?.fingerprint === g.fingerprint ? " selected" : ""}`} onClick={() => drill(g)}>
                        <td>
                          <span className="badge-err">{g.errorType || "error"}</span>
                          {g.message && <div className="hint" style={{ marginTop: 4, maxWidth: 320, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{g.message}</div>}
                        </td>
                        <td>
                          <span className="svc-tag"><span className="swatch" style={{ background: serviceColor(g.service) }} />{g.service}</span>
                          <div className="hint">{g.operation}</div>
                        </td>
                        <td>
                          <div style={{ height: 6, background: "var(--bg-inset)", borderRadius: 3, overflow: "hidden" }}>
                            <div style={{ width: `${(g.count / maxCount) * 100}%`, height: "100%", background: "var(--err)", opacity: 0.7 }} />
                          </div>
                        </td>
                        <td className="num">{g.count.toLocaleString()}</td>
                        <td className="num hint">{formatTimeAgo(g.lastSeen)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          <div style={{ width: 380, flex: "none" }}>
            <div className="detail">
              {!selected ? (
                <div className="dh hint">Select an error group to drill in</div>
              ) : (
                <>
                  <div className="dh">
                    <div className="svc-tag" style={{ fontSize: 13, fontWeight: 600 }}>
                      <span className="swatch" style={{ width: 10, height: 10, background: serviceColor(selected.service) }} />
                      {selected.errorType || "error"}
                    </div>
                    <div className="hint" style={{ marginTop: 5 }}>{selected.service} · {selected.operation}</div>
                  </div>
                  {selected.message && (
                    <div style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
                      <div className="err-note">{selected.message}</div>
                    </div>
                  )}
                  <div className="kv">
                    <div className="k">Count</div><div className="v">{selected.count.toLocaleString()}</div>
                    <div className="k">First seen</div><div className="v">{formatTimeAgo(selected.firstSeen)}</div>
                    <div className="k">Last seen</div><div className="v">{formatTimeAgo(selected.lastSeen)}</div>
                    <div className="k">Fingerprint</div><div className="v">{shortId(selected.fingerprint, 16)}</div>
                  </div>
                  <div className="sec">Sample traces</div>
                  <div style={{ padding: "10px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
                    {(selected.sampleTraces ?? []).length === 0 ? (
                      <span className="hint">No sample traces captured</span>
                    ) : (
                      selected.sampleTraces.map((tid) => (
                        <Link key={tid} href={`/traces/${tid}`} className="link mono" style={{ fontSize: 12 }}>{shortId(tid, 20)} →</Link>
                      ))
                    )}
                  </div>
                  <div className="sec">Explore</div>
                  <div style={{ padding: "10px 16px" }}>
                    <Link
                      className="btn ghost"
                      href={`/explore?service=${encodeURIComponent(selected.service)}&onlyErrors=true`}
                    >
                      All errors for {selected.service} →
                    </Link>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
