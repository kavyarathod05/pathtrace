import type {
  AlertEvent,
  AlertRule,
  ConnectInfo,
  DependencyEdge,
  ErrorGroup,
  FacetValue,
  FlameNode,
  Hotspot,
  NotificationChannel,
  REDSeries,
  SavedView,
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

async function sendJSON<T>(path: string, method: string, body?: unknown): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) throw new Error(await res.text());
  if (res.status === 204) return undefined as T;
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
      q: params.q,
      start: params.start,
      end: params.end,
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

export async function fetchRED(
  project: string,
  service: string,
  operation?: string,
  window = "1h",
  step = "1m",
): Promise<REDSeries> {
  return getJSON<REDSeries>(`/api/metrics/red${qs(project, { service, operation, window, step })}`);
}

export async function fetchErrorGroups(project: string, window = "1h"): Promise<ErrorGroup[]> {
  const data = await getJSON<{ groups: ErrorGroup[] }>(`/api/errors${qs(project, { window })}`);
  return data.groups ?? [];
}

export async function fetchErrorGroup(project: string, fingerprint: string, window = "1h"): Promise<ErrorGroup> {
  return getJSON<ErrorGroup>(`/api/errors/${encodeURIComponent(fingerprint)}${qs(project, { window })}`);
}

export async function fetchFlameGraph(
  project: string,
  service: string,
  operation?: string,
  window = "1h",
): Promise<FlameNode> {
  return getJSON<FlameNode>(`/api/flamegraph${qs(project, { service, operation, window })}`);
}

export async function fetchSavedViews(project: string): Promise<SavedView[]> {
  const data = await getJSON<{ views: SavedView[] }>(`/api/views${qs(project)}`);
  return data.views ?? [];
}

export async function createSavedView(project: string, view: Partial<SavedView>): Promise<SavedView> {
  return sendJSON<SavedView>(`/api/views${qs(project)}`, "POST", view);
}

export async function deleteSavedView(project: string, id: number): Promise<void> {
  await sendJSON<void>(`/api/views/${id}${qs(project)}`, "DELETE");
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
  return sendJSON<AlertRule>(`/api/alerts${qs(project)}`, "POST", rule);
}

export async function updateAlertRule(project: string, id: number, patch: Partial<AlertRule>): Promise<AlertRule> {
  return sendJSON<AlertRule>(`/api/alerts/${id}${qs(project)}`, "PATCH", patch);
}

export async function deleteAlertRule(project: string, id: number): Promise<void> {
  await sendJSON<void>(`/api/alerts/${id}${qs(project)}`, "DELETE");
}

export async function fetchChannels(project: string): Promise<NotificationChannel[]> {
  const data = await getJSON<{ channels: NotificationChannel[] }>(`/api/alerts/channels${qs(project)}`);
  return data.channels ?? [];
}

export async function createChannel(project: string, ch: Partial<NotificationChannel>): Promise<NotificationChannel> {
  return sendJSON<NotificationChannel>(`/api/alerts/channels${qs(project)}`, "POST", ch);
}

export async function deleteChannel(project: string, id: number): Promise<void> {
  await sendJSON<void>(`/api/alerts/channels/${id}${qs(project)}`, "DELETE");
}

export async function testChannel(project: string, id: number): Promise<void> {
  await sendJSON(`/api/alerts/channels/${id}/test${qs(project)}`, "POST");
}

export function liveTailURL(project: string): string {
  return `${API_BASE}/api/live${qs(project)}`;
}

export function exploreURL(params: SearchParams, project?: string): string {
  const q = new URLSearchParams();
  if (project) q.set("project", project);
  if (params.service) q.set("service", params.service);
  if (params.operation) q.set("operation", params.operation);
  if (params.minDuration) q.set("minDuration", params.minDuration);
  if (params.maxDuration) q.set("maxDuration", params.maxDuration);
  if (params.tags) q.set("tags", params.tags);
  if (params.q) q.set("q", params.q);
  if (params.onlyErrors) q.set("onlyErrors", "true");
  const s = q.toString();
  return `/explore${s ? `?${s}` : ""}`;
}
