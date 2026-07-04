"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { fetchIncidentTimeline } from "@/lib/api";
import { useProject } from "@/lib/project";
import { PageHeader } from "@/components/shell/PageHeader";
import { TimelineList } from "@/components/intelligence/IncidentUI";
import type { IncidentEvent } from "@/lib/types";

export default function TimelinePage() {
  const params = useParams();
  const id = Number(params.id);
  const { project } = useProject();
  const [events, setEvents] = useState<IncidentEvent[]>([]);

  useEffect(() => {
    fetchIncidentTimeline(project, id).then(setEvents);
  }, [project, id]);

  return (
    <>
      <PageHeader title="Change Timeline" subtitle="Unified event reconstruction" />
      <div className="page-body">
        <div className="intel-card">
          {events.length === 0 ? (
            <div className="empty">No timeline events yet</div>
          ) : (
            <TimelineList events={events} />
          )}
        </div>
      </div>
    </>
  );
}
