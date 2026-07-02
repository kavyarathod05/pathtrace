"use client";

import { useEffect, useState } from "react";
import { fetchFacets } from "@/lib/api";
import { useProject } from "@/lib/project";
import type { FacetValue } from "@/lib/types";

const TAGS = ["http.route", "deployment.environment", "error.type", "service.name"];

export default function FacetsPage() {
  const { project } = useProject();
  const [tag, setTag] = useState("http.route");
  const [facets, setFacets] = useState<FacetValue[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setError(null);
    fetchFacets(project, tag, "1h").then(setFacets).catch((e) => setError(String(e)));
  }, [project, tag]);

  const max = Math.max(1, ...facets.map((f) => f.count));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Tag Facets</h1>
          <div className="sub">Top attribute values · project <code>{project}</code> · last 1h</div>
        </div>
        <div className="field">
          <label>Tag key</label>
          <select value={tag} onChange={(e) => setTag(e.target.value)}>
            {TAGS.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </div>
      </div>
      <div className="page-body">
        {error && <div className="err-note" style={{ marginBottom: 16 }}>{error}</div>}
        <div className="panel">
          {facets.length === 0 ? (
            <div className="empty">No values for <code>{tag}</code> in this window.</div>
          ) : (
            <table>
              <thead><tr><th>Value</th><th style={{ width: "45%" }}>Share</th><th className="num">Count</th></tr></thead>
              <tbody>
                {facets.map((f) => (
                  <tr key={f.value}>
                    <td><code>{f.value || "(empty)"}</code></td>
                    <td>
                      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                        <div style={{ flex: 1, height: 6, background: "var(--bg-inset)", borderRadius: 3, overflow: "hidden" }}>
                          <div style={{ width: `${(f.count / max) * 100}%`, height: "100%", background: "var(--accent)", opacity: 0.75, borderRadius: 3 }} />
                        </div>
                        <span className="hint" style={{ width: 36, textAlign: "right" }}>{Math.round((f.count / max) * 100)}%</span>
                      </div>
                    </td>
                    <td className="num">{f.count.toLocaleString()}</td>
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
