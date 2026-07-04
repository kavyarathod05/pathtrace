"use client";

import Link from "next/link";
import type { Insight } from "@/lib/monitor";

interface HealthInsightBannerProps {
  insight: Insight;
  project: string;
}

export function HealthInsightBanner({ insight }: HealthInsightBannerProps) {
  return (
    <div className={`health-banner health-banner--${insight.status}`}>
      <div className="health-banner__main">
        <span className="health-banner__icon" aria-hidden>
          {insight.status === "healthy" ? "✓" : insight.status === "degraded" ? "!" : "⚠"}
        </span>
        <p className="health-banner__message">{insight.message}</p>
      </div>
      {insight.status !== "healthy" && (
        <div className="health-banner__actions">
          <Link className="btn sm" href="/incidents">
            View incidents
          </Link>
        </div>
      )}
    </div>
  );
}
