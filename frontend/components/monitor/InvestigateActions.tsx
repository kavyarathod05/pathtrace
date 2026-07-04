"use client";

import Link from "next/link";
import type { Insight } from "@/lib/monitor";
import { exploreURL } from "@/lib/api";

interface InvestigateActionsProps {
  insight: Insight;
  project: string;
  scope: string;
}

export function InvestigateActions({ insight, project, scope }: InvestigateActionsProps) {
  const service = insight.service ?? scope;
  const tracesHref = exploreURL(
    {
      service,
      operation: insight.operation,
      onlyErrors: insight.status !== "healthy",
    },
    project,
  );
  const errorsHref = service ? `/errors` : "/errors";
  const flameHref = service
    ? `/flame?service=${encodeURIComponent(service)}${insight.operation ? `&operation=${encodeURIComponent(insight.operation)}` : ""}`
    : "/flame";

  const primary =
    insight.status === "critical" || (insight.operation && insight.status === "degraded")
      ? "errors"
      : insight.status === "degraded"
        ? "flame"
        : "traces";

  const primaryBtn = primary === "traces" ? "" : " ghost";
  const errorsBtn = primary === "errors" ? "" : " ghost";
  const flameBtn = primary === "flame" ? "" : " ghost";

  return (
    <div className="investigate-bar">
      <span className="investigate-bar__label">Investigate</span>
      <div className="investigate-bar__actions">
        <Link className={`btn${primaryBtn}`} href={tracesHref}>
          View affected traces
        </Link>
        <Link className={`btn${errorsBtn}`} href={errorsHref}>
          View errors
        </Link>
        <Link className="btn ghost" href="/health">
          Open service health
        </Link>
        <Link className={`btn${flameBtn}`} href={flameHref}>
          Open flame graph
        </Link>
      </div>
    </div>
  );
}
