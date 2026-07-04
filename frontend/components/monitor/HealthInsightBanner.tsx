"use client";

import Link from "next/link";
import type { Insight } from "@/lib/monitor";
import { exploreURL } from "@/lib/api";

interface HealthInsightBannerProps {
  insight: Insight;
  project: string;
}

export function HealthInsightBanner({ insight, project }: HealthInsightBannerProps) {
  const tracesHref = insight.service
    ? exploreURL(
        {
          service: insight.service,
          operation: insight.operation,
          onlyErrors: insight.status !== "healthy",
        },
        project,
      )
    : "/explore";

  return (
    <div className={`health-banner health-banner--${insight.status}`}>
      <div className="health-banner__main">
        <span className="health-banner__icon" aria-hidden>
          {insight.status === "healthy" ? "✓" : insight.status === "degraded" ? "!" : "⚠"}
        </span>
        <p className="health-banner__message">{insight.message}</p>
      </div>
      {insight.status !== "healthy" && insight.service && (
        <div className="health-banner__actions">
          <Link className="btn sm" href={tracesHref}>
            View affected traces
          </Link>
          <Link className="btn ghost sm" href="/health">
            Open service health
          </Link>
        </div>
      )}
    </div>
  );
}
