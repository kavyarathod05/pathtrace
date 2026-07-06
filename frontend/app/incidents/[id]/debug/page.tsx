"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchIncident } from "@/lib/api";
import { useProject } from "@/lib/project";
import { PageHeader } from "@/components/shell/PageHeader";
import { PlaybookList } from "@/components/intelligence/IncidentUI";
import type { Incident } from "@/lib/types";

export default function DebugPage() {
  const params = useParams();
  const id = Number(params.id);
  const { project } = useProject();
  const [incident, setIncident] = useState<Incident | null>(null);

  useEffect(() => {
    fetchIncident(project, id).then(setIncident);
  }, [project, id]);

  if (!incident) return <div className="page-body empty"><div className="big">Loading…</div></div>;

  return (
    <>
      <PageHeader title="Debug Assistant" subtitle="Ranked investigation steps" />
      <div className="page-body stack">
        <PlaybookList steps={incident.playbook} />
      </div>
    </>
  );
}
