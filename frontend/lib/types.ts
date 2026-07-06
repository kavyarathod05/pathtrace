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
  enabled: boolean;
  severity?: string;
  forSec?: number;
  cooldownSec?: number;
  channelId?: number;
  sloTarget?: number;
  sloWindowSec?: number;
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
  state: string;
  severity: string;
}

export interface NotificationChannel {
  id: number;
  projectId: string;
  name: string;
  type: string;
  config: Record<string, string>;
}

export interface SavedView {
  id: number;
  projectId: string;
  name: string;
  kind: string;
  params: Record<string, unknown>;
  createdAt: string;
}

export interface TimeSeriesPoint {
  time: string;
  count: number;
  errorCount: number;
  p50Us: number;
  p95Us: number;
  p99Us: number;
}

export interface REDSeries {
  service: string;
  operation?: string;
  step: string;
  points: TimeSeriesPoint[];
}

export interface ErrorGroup {
  fingerprint: string;
  service: string;
  operation: string;
  errorType: string;
  message?: string;
  count: number;
  firstSeen: string;
  lastSeen: string;
  sampleTraces: string[];
}

export interface FlameNode {
  name: string;
  service: string;
  totalUs: number;
  selfUs: number;
  count: number;
  children?: FlameNode[];
}

export interface SearchParams {
  service?: string;
  operation?: string;
  minDuration?: string;
  maxDuration?: string;
  onlyErrors?: boolean;
  tags?: string;
  q?: string;
  start?: string;
  end?: string;
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

export interface RootCause {
  hypothesis: string;
  confidence: number;
  bottleneckService?: string;
  bottleneckOperation?: string;
  latencyInjectionPoint?: string;
  evidenceTraceIds?: string[];
  reasoning?: string[];
}

export interface ImpactedService {
  service: string;
  severity: number;
  errorRate?: number;
  p95Delta?: number;
}

export interface BlastRadiusEntry {
  service: string;
  hop: number;
  severity: number;
  errorRate?: number;
  callVolume?: number;
}

export interface PlaybookStep {
  priority: number;
  action: string;
  rationale?: string;
  kind?: "manual" | "trace" | "explore" | "link";
  href?: string;
  traceId?: string;
  service?: string;
  operation?: string;
}

export interface DebugContext {
  incidentId: number;
  title: string;
  primaryService: string;
  severity: number;
  severityLabel: string;
  status: string;
  hypothesis: string;
  confidence: number;
  playbook: PlaybookStep[];
  evidence: TraceSummary[];
  hotspots: Hotspot[];
  deployments: Deployment[];
  serviceHealth?: ServiceHealth;
  impacted: ImpactedService[];
  blastRadius: BlastRadiusEntry[];
}

export interface Deployment {
  id: number;
  projectId: string;
  service: string;
  version?: string;
  changeType: string;
  deployedAt: string;
}

export interface Incident {
  id: number;
  projectId: string;
  title: string;
  status: string;
  severity: number;
  severityLabel: string;
  primaryService: string;
  rootCause: RootCause;
  impacted: ImpactedService[];
  blastRadius: BlastRadiusEntry[];
  playbook: PlaybookStep[];
  fingerprint: string;
  startedAt: string;
  resolvedAt?: string;
  updatedAt: string;
}

export interface IncidentEvent {
  id: number;
  incidentId: number;
  eventType: string;
  service?: string;
  summary: string;
  evidence: Record<string, unknown>;
  occurredAt: string;
}

export interface IntelligenceOverview {
  systemStatus: string;
  activeIncidents: number;
  criticalIncidents: number;
  topImpactedService?: string;
  insight: string;
  recentIncidents?: Incident[];
}
