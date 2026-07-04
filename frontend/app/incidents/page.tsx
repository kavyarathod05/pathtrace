"use client";

import { useEffect, useState } from "react";
import { fetchIncidents } from "@/lib/api";
import { useProject } from "@/lib/project";
import { PageHeader } from "@/components/shell/PageHeader";
import { IncidentCard } from "@/components/intelligence/IncidentUI";
import type { Incident } from "@/lib/types";

export default function IncidentsPage() {
  const { project } = useProject();
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [filter, setFilter] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetchIncidents(project, filter || undefined)
      .then(setIncidents)
      .catch((e) => setError(String(e)));
  }, [project, filter]);

  return (
    <>
      <PageHeader title="Incidents" subtitle="Primary incident feed — auto-detected from telemetry" />
      <div className="page-body stack">
        <div className="cluster">
          {["", "open", "resolved"].map((s) => (
            <button
              key={s || "all"}
              type="button"
              className={`btn sm${filter === s ? "" : " ghost"}`}
              onClick={() => setFilter(s)}
            >
              {s || "all"}
            </button>
          ))}
        </div>
        {error && <div className="err-note">{error}</div>}
        {incidents.length === 0 && !error ? (
          <div className="empty">
            <div className="big">No incidents in this window</div>
            Incidents are generated automatically when error rates or latency spike.
          </div>
        ) : (
          <div className="stack">
            {incidents.map((inc) => (
              <IncidentCard key={inc.id} incident={inc} />
            ))}
          </div>
        )}
      </div>
    </>
  );
}
