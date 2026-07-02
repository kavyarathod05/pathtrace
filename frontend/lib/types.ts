// Shared types mirroring the PathTrace backend JSON API.

export interface SpanEvent {
  time: string;
  name: string;
  attributes?: Record<string, unknown>;
}

export interface SpanRef {
  traceId: string;
  spanId: string;
  kind?: string;
}

export interface Span {
  projectId: string;
  traceId: string;
  spanId: string;
  parentSpanId?: string;
  serviceName: string;
  operationName: string;
  kind?: string;
  startTime: string;
  durationUs: number;
  statusCode?: string;
  statusMessage?: string;
  tags: Record<string, unknown>;
  events: SpanEvent[];
  refs: SpanRef[];
}

export interface TraceSummary {
  traceId: string;
  rootService: string;
  rootOperation: string;
  startTime: string;
  durationUs: number;
  spanCount: number;
  errorCount: number;
  services: string[];
}

export interface Trace {
  traceId: string;
  spans: Span[];
  summary: TraceSummary;
}

export interface DependencyEdge {
  parent: string;
  child: string;
  callCount: number;
  errorCount: number;
}

export interface ServiceHealth {
  service: string;
  spanCount: number;
  errorCount: number;
  errorRate: number;
  p50Us: number;
  p95Us: number;
  p99Us: number;
  throughputPerMin: number;
}

export interface Hotspot {
  service: string;
  operation: string;
  errorCount: number;
  totalCount: number;
  errorRate: number;
}

export interface AlertRule {
  id: number;
  projectId: string;
  name: string;
  service?: string;
  metric: string;
  op: string;
  threshold: number;
  windowSec: number;
}

export interface AlertEvent {
  id: number;
  ruleId: number;
  ruleName: string;
  service?: string;
  metric: string;
  firedAt: string;
  value: number;
  threshold: number;
}

export interface SearchParams {
  service?: string;
  operation?: string;
  minDuration?: string;
  maxDuration?: string;
  onlyErrors?: boolean;
  tags?: string;
  limit?: number;
}

export interface FacetValue {
  value: string;
  count: number;
}

export interface ConnectInfo {
  httpEndpoint: string;
  grpcEndpoint: string;
  grpcPort: string;
  header: string;
  demoProject: string;
  viewParam: string;
  ingestKeys: { key: string; project: string }[];
  otelEnvExample: Record<string, string>;
}
