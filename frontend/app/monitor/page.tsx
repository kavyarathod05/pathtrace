"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchHotspots, fetchRED, fetchServiceHealth } from "@/lib/api";
import { useProject } from "@/lib/project";
import { useTimeWindow } from "@/lib/time-context";
import type { Hotspot, ServiceHealth, TimeSeriesPoint } from "@/lib/types";
import { PageHeader } from "@/components/shell/PageHeader";
import { HealthInsightBanner } from "@/components/monitor/HealthInsightBanner";
import { KeyMetricsRow } from "@/components/monitor/KeyMetricsRow";
import { TrendPanel } from "@/components/monitor/TrendPanel";
import { ImpactedServicesSection } from "@/components/monitor/ImpactedServicesSection";
import { InvestigateActions } from "@/components/monitor/InvestigateActions";
import {
  aggregateHealth,
  computeInsight,
  pickFocusService,
  stepFor,
} from "@/lib/monitor";

export default function MonitorPage() {
  const { project } = useProject();
  const { window: win, refreshKey } = useTimeWindow();
  const [health, setHealth] = useState<ServiceHealth[]>([]);
  const [hotspots, setHotspots] = useState<Hotspot[]>([]);
  const [scope, setScope] = useState("");
  const [redPoints, setRedPoints] = useState<{ step: string; points: TimeSeriesPoint[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [trendLoading, setTrendLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(null);
    Promise.all([fetchServiceHealth(project, win), fetchHotspots(project, win)])
      .then(([h, hot]) => {
        setHealth(h);
        setHotspots(hot);
        const focus = pickFocusService(h, hot) ?? h[0]?.service ?? "";
        setScope((prev) => (prev && h.some((s) => s.service === prev) ? prev : focus));
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [project, win, refreshKey]);

  useEffect(() => {
    if (!scope) {
      setRedPoints(null);
      return;
    }
    setTrendLoading(true);
    fetchRED(project, scope, undefined, win, stepFor(win))
      .then((series) => setRedPoints({ step: series.step, points: series.points }))
      .catch(() => setRedPoints(null))
      .finally(() => setTrendLoading(false));
  }, [project, scope, win, refreshKey]);

  const points = redPoints?.points ?? [];
  const kpis = useMemo(() => aggregateHealth(health), [health]);
  const insight = useMemo(
    () => computeInsight(health, hotspots, win, points),
    [health, hotspots, win, points],
  );
  const services = useMemo(() => health.map((h) => h.service), [health]);

  return (
    <>
      <PageHeader
        title="System Health"
        subtitle={<>Overview for project <code>{project}</code></>}
      />

      <div className="page-body monitor-page">
        {error && <div className="err-note" style={{ marginBottom: 16 }}>{error}</div>}

        {loading ? (
          <div className="empty"><div className="big">Loading system health…</div></div>
        ) : health.length === 0 ? (
          <div className="empty">
            <div className="big">No traffic in this window</div>
            Try a longer time range or send demo traffic.
          </div>
        ) : (
          <>
            <HealthInsightBanner insight={insight} project={project} />

            <KeyMetricsRow kpis={kpis} points={points} />

            <TrendPanel
              points={points}
              step={redPoints?.step ?? stepFor(win)}
              services={services}
              scope={scope}
              onScopeChange={setScope}
              loading={trendLoading}
            />

            <ImpactedServicesSection health={health} onSelect={setScope} />

            <InvestigateActions insight={insight} project={project} scope={scope} />
          </>
        )}
      </div>
    </>
  );
}
