import type {
  AlertEvent,
  AlertRule,
  ConnectInfo,
  DependencyEdge,
  FacetValue,
  Hotspot,
  SearchParams,
  ServiceHealth,
  Trace,
  TraceSummary,
} from "./types";

export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/, "") || "http://localhost:8080";

function qs(project: string, params?: Record<string, string | number | boolean | undefined>) {
  const q = new URLSearchParams();
  if (project) q.set("project", project);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== "" && v !== false) q.set(k, String(v));
    }
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

async function getJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, { cache: "no-store" });
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(`${res.status}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchProjects(): Promise<string[]> {
  const data = await getJSON<{ projects: string[] }>("/api/projects");
  return data.projects ?? [];
}

export async function fetchConnect(): Promise<ConnectInfo> {
  return getJSON<ConnectInfo>("/api/connect");
}

export async function fetchServices(project: string): Promise<string[]> {
  const data = await getJSON<{ services: string[] }>(`/api/services${qs(project)}`);
  return data.services ?? [];
}

export async function fetchOperations(project: string, service: string): Promise<string[]> {
  const data = await getJSON<{ operations: string[] }>(
    `/api/operations${qs(project, { service })}`,
  );
  return data.operations ?? [];
}

export async function searchTraces(project: string, params: SearchParams): Promise<TraceSummary[]> {
  const data = await getJSON<{ traces: TraceSummary[] }>(
    `/api/traces${qs(project, {
      service: params.service,
      operation: params.operation,
      minDuration: params.minDuration,
      maxDuration: params.maxDuration,
      onlyErrors: params.onlyErrors ? "true" : undefined,
      tags: params.tags,
      limit: params.limit ?? 40,
    })}`,
  );
  return data.traces ?? [];
}

export async function fetchTrace(project: string, traceId: string): Promise<Trace> {
  return getJSON<Trace>(`/api/traces/${encodeURIComponent(traceId)}${qs(project)}`);
}

export async function fetchDependencies(project: string, window = "1h"): Promise<DependencyEdge[]> {
  const data = await getJSON<{ edges: DependencyEdge[] }>(`/api/dependencies${qs(project, { window })}`);
  return data.edges ?? [];
}

export async function fetchServiceHealth(project: string, window = "1h"): Promise<ServiceHealth[]> {
  const data = await getJSON<{ services: ServiceHealth[] }>(`/api/health/services${qs(project, { window })}`);
  return data.services ?? [];
}

export async function fetchHotspots(project: string, window = "1h"): Promise<Hotspot[]> {
  const data = await getJSON<{ hotspots: Hotspot[] }>(`/api/hotspots${qs(project, { window })}`);
  return data.hotspots ?? [];
}

export async function fetchFacets(project: string, tag: string, window = "1h"): Promise<FacetValue[]> {
  const data = await getJSON<{ facets: FacetValue[] }>(`/api/facets${qs(project, { tag, window })}`);
  return data.facets ?? [];
}

export async function fetchAlertRules(project: string): Promise<AlertRule[]> {
  const data = await getJSON<{ rules: AlertRule[] }>(`/api/alerts${qs(project)}`);
  return data.rules ?? [];
}

export async function fetchAlertEvents(project: string): Promise<AlertEvent[]> {
  const data = await getJSON<{ events: AlertEvent[] }>(`/api/alerts/events${qs(project)}`);
  return data.events ?? [];
}

export async function createAlertRule(project: string, rule: Partial<AlertRule>): Promise<AlertRule> {
  const res = await fetch(`${API_BASE}/api/alerts${qs(project)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(rule),
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function deleteAlertRule(project: string, id: number): Promise<void> {
  const res = await fetch(`${API_BASE}/api/alerts/${id}${qs(project)}`, { method: "DELETE" });
  if (!res.ok) throw new Error(await res.text());
}

export function liveTailURL(project: string): string {
  return `${API_BASE}/api/live${qs(project)}`;
}
