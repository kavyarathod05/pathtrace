"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchIncidentDebug } from "@/lib/api";
import { useProject } from "@/lib/project";
import { PageHeader } from "@/components/shell/PageHeader";
import { DebugAssistant } from "@/components/intelligence/DebugAssistant";
import { SeverityBadge } from "@/components/intelligence/IncidentUI";
import type { DebugContext } from "@/lib/types";

export default function DebugPage() {
  const params = useParams();
  const id = Number(params.id);
  const { project } = useProject();
  const [data, setData] = useState<DebugContext | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    setError(null);
    fetchIncidentDebug(project, id)
      .then(setData)
      .catch((e) => setError(String(e)));
  }, [project, id]);

  if (error) return <div className="page-body err-note">{error}</div>;
  if (!data) return <div className="page-body empty"><div className="big">Loading debug assistant…</div></div>;

  return (
    <>
      <PageHeader
        title="Debug Assistant"
        subtitle={`Guided investigation for ${data.primaryService}`}
        actions={<SeverityBadge label={data.severityLabel} score={data.severity} />}
      />
      <div className="page-body">
        <DebugAssistant data={data} project={project} />
      </div>
    </>
  );
}
