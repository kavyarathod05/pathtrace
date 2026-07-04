// Package model holds the core domain types shared across PathTrace:
// spans, traces, and the query/analytics result shapes returned by the API.
package model

import "time"

// Span is a single unit of work within a trace (one operation in one service).
type Span struct {
	ProjectID     string         `json:"projectId"`
	TraceID       string         `json:"traceId"`
	SpanID        string         `json:"spanId"`
	ParentSpanID  string         `json:"parentSpanId,omitempty"`
	ServiceName   string         `json:"serviceName"`
	OperationName string         `json:"operationName"`
	Kind          string         `json:"kind,omitempty"`
	StartTime     time.Time      `json:"startTime"`
	DurationUS    int64          `json:"durationUs"`
	StatusCode    string         `json:"statusCode,omitempty"`
	StatusMessage string         `json:"statusMessage,omitempty"`
	Tags          map[string]any `json:"tags"`
	Events        []SpanEvent    `json:"events"`
	Refs          []SpanRef      `json:"refs"`
}

// SpanEvent is a timestamped log/annotation attached to a span.
type SpanEvent struct {
	Time       time.Time      `json:"time"`
	Name       string         `json:"name"`
	Attributes map[string]any `json:"attributes,omitempty"`
}

// SpanRef links a span to another span (e.g. an OTLP link).
type SpanRef struct {
	TraceID string `json:"traceId"`
	SpanID  string `json:"spanId"`
	Kind    string `json:"kind,omitempty"`
}

// Trace is a full set of spans that share a trace ID, plus derived summary data.
type Trace struct {
	TraceID    string `json:"traceId"`
	Spans      []Span `json:"spans"`
	Summary    TraceSummary `json:"summary"`
}

// TraceSummary is the lightweight header shown in search results.
type TraceSummary struct {
	TraceID       string    `json:"traceId"`
	RootService   string    `json:"rootService"`
	RootOperation string    `json:"rootOperation"`
	StartTime     time.Time `json:"startTime"`
	DurationUS    int64     `json:"durationUs"`
	SpanCount     int       `json:"spanCount"`
	ErrorCount    int       `json:"errorCount"`
	Services      []string  `json:"services"`
}

// TraceQuery captures the search filters accepted by the query API.
type TraceQuery struct {
	ProjectID   string
	Service     string
	Operation   string
	MinDuration int64 // microseconds
	MaxDuration int64 // microseconds; 0 = no upper bound
	OnlyErrors  bool
	Tags        map[string]string
	Start       time.Time
	End         time.Time
	Limit       int
}

// DependencyEdge is one directed service-to-service call aggregation.
type DependencyEdge struct {
	Parent    string `json:"parent"`
	Child     string `json:"child"`
	CallCount int64  `json:"callCount"`
	ErrorCount int64 `json:"errorCount"`
}

// ServiceHealth is the per-service scorecard over a time window.
type ServiceHealth struct {
	Service     string  `json:"service"`
	SpanCount   int64   `json:"spanCount"`
	ErrorCount  int64   `json:"errorCount"`
	ErrorRate   float64 `json:"errorRate"`
	P50US       float64 `json:"p50Us"`
	P95US       float64 `json:"p95Us"`
	P99US       float64 `json:"p99Us"`
	ThroughputPerMin float64 `json:"throughputPerMin"`
}

// Hotspot is an error-prone operation surfaced by the analytics engine.
type Hotspot struct {
	Service     string  `json:"service"`
	Operation   string  `json:"operation"`
	ErrorCount  int64   `json:"errorCount"`
	TotalCount  int64   `json:"totalCount"`
	ErrorRate   float64 `json:"errorRate"`
}

// FacetValue is a single value/count pair for the tag explorer.
type FacetValue struct {
	Value string `json:"value"`
	Count int64  `json:"count"`
}

// AlertRule defines an SLO/threshold that the evaluator checks on a schedule.
type AlertRule struct {
	ID           int64   `json:"id"`
	ProjectID    string  `json:"projectId"`
	Name         string  `json:"name"`
	Service      string  `json:"service,omitempty"`
	Metric       string  `json:"metric"` // p95_latency_us | error_rate | slo_burn_rate
	Op           string  `json:"op"`     // > | < | >= | <=
	Threshold    float64 `json:"threshold"`
	WindowSec    int     `json:"windowSec"`
	Enabled      bool    `json:"enabled"`
	Severity     string  `json:"severity,omitempty"` // info | warning | critical
	ForSec       int     `json:"forSec"`
	CooldownSec  int     `json:"cooldownSec"`
	ChannelID    *int64  `json:"channelId,omitempty"`
	SLOTarget    float64 `json:"sloTarget,omitempty"`
	SLOWindowSec int     `json:"sloWindowSec,omitempty"`
}

// AlertEvent is a recorded firing or resolution of an alert rule.
type AlertEvent struct {
	ID        int64     `json:"id"`
	RuleID    int64     `json:"ruleId"`
	RuleName  string    `json:"ruleName"`
	Service   string    `json:"service,omitempty"`
	Metric    string    `json:"metric"`
	FiredAt   time.Time `json:"firedAt"`
	Value     float64   `json:"value"`
	Threshold float64   `json:"threshold"`
	State     string    `json:"state"`    // firing | resolved
	Severity  string    `json:"severity"` // info | warning | critical
}

// NotificationChannel delivers alert notifications (webhook or Slack).
type NotificationChannel struct {
	ID        int64          `json:"id"`
	ProjectID string         `json:"projectId"`
	Name      string         `json:"name"`
	Type      string         `json:"type"` // webhook | slack
	Config    map[string]any `json:"config"`
}

// AlertState tracks the current lifecycle state of a rule.
type AlertState struct {
	RuleID       int64      `json:"ruleId"`
	State        string     `json:"state"` // ok | pending | firing
	Since        time.Time  `json:"since"`
	LastNotified *time.Time `json:"lastNotified,omitempty"`
}

// SavedView is a named, shareable filter preset.
type SavedView struct {
	ID        int64          `json:"id"`
	ProjectID string         `json:"projectId"`
	Name      string         `json:"name"`
	Kind      string         `json:"kind"` // explore | monitor | errors
	Params    map[string]any `json:"params"`
	CreatedAt time.Time      `json:"createdAt"`
}

// TimeSeriesPoint is one bucket in a RED metrics time series.
type TimeSeriesPoint struct {
	Time       time.Time `json:"time"`
	Count      int64     `json:"count"`
	ErrorCount int64     `json:"errorCount"`
	P50US      float64   `json:"p50Us"`
	P95US      float64   `json:"p95Us"`
	P99US      float64   `json:"p99Us"`
}

// REDSeries is rate/errors/duration metrics over time.
type REDSeries struct {
	Service   string            `json:"service"`
	Operation string            `json:"operation,omitempty"`
	Step      string            `json:"step"`
	Points    []TimeSeriesPoint `json:"points"`
}

// ErrorGroup aggregates error spans into an issue.
type ErrorGroup struct {
	Fingerprint  string    `json:"fingerprint"`
	Service      string    `json:"service"`
	Operation    string    `json:"operation"`
	ErrorType    string    `json:"errorType"`
	Message      string    `json:"message,omitempty"`
	Count        int64     `json:"count"`
	FirstSeen    time.Time `json:"firstSeen"`
	LastSeen     time.Time `json:"lastSeen"`
	SampleTraces []string  `json:"sampleTraces"`
}

// FlameNode is one node in an aggregated flame graph.
type FlameNode struct {
	Name     string      `json:"name"`
	Service  string      `json:"service"`
	TotalUS  int64       `json:"totalUs"`
	SelfUS   int64       `json:"selfUs"`
	Count    int64       `json:"count"`
	Children []FlameNode `json:"children,omitempty"`
}

// RootCause is the analyzed hypothesis for an incident.
type RootCause struct {
	Hypothesis            string   `json:"hypothesis"`
	Confidence            float64  `json:"confidence"`
	BottleneckService     string   `json:"bottleneckService,omitempty"`
	BottleneckOperation   string   `json:"bottleneckOperation,omitempty"`
	LatencyInjectionPoint string   `json:"latencyInjectionPoint,omitempty"`
	EvidenceTraceIDs      []string `json:"evidenceTraceIds,omitempty"`
	Reasoning             []string `json:"reasoning,omitempty"`
}

// ImpactedService is one service affected by an incident.
type ImpactedService struct {
	Service    string  `json:"service"`
	Severity   int     `json:"severity"`
	ErrorRate  float64 `json:"errorRate,omitempty"`
	P95Delta   float64 `json:"p95Delta,omitempty"`
}

// BlastRadiusEntry is one hop in failure propagation.
type BlastRadiusEntry struct {
	Service    string  `json:"service"`
	Hop        int     `json:"hop"`
	Severity   int     `json:"severity"`
	ErrorRate  float64 `json:"errorRate,omitempty"`
	CallVolume int64   `json:"callVolume,omitempty"`
}

// PlaybookStep is one suggested debug action.
type PlaybookStep struct {
	Priority  int    `json:"priority"`
	Action    string `json:"action"`
	Rationale string `json:"rationale,omitempty"`
}

// Incident is a materialized intelligence entity.
type Incident struct {
	ID             int64              `json:"id"`
	ProjectID      string             `json:"projectId"`
	Title          string             `json:"title"`
	Status         string             `json:"status"`
	Severity       int                `json:"severity"`
	SeverityLabel  string             `json:"severityLabel"`
	PrimaryService string             `json:"primaryService"`
	RootCause      RootCause          `json:"rootCause"`
	Impacted       []ImpactedService  `json:"impacted"`
	BlastRadius    []BlastRadiusEntry `json:"blastRadius"`
	Playbook       []PlaybookStep     `json:"playbook"`
	Fingerprint    string             `json:"fingerprint"`
	StartedAt      time.Time          `json:"startedAt"`
	ResolvedAt     *time.Time         `json:"resolvedAt,omitempty"`
	UpdatedAt      time.Time          `json:"updatedAt"`
}

// IncidentEvent is one timeline entry for an incident.
type IncidentEvent struct {
	ID         int64          `json:"id"`
	IncidentID int64          `json:"incidentId"`
	EventType  string         `json:"eventType"`
	Service    string         `json:"service,omitempty"`
	Summary    string         `json:"summary"`
	Evidence   map[string]any `json:"evidence"`
	OccurredAt time.Time      `json:"occurredAt"`
}

// Deployment records a service change.
type Deployment struct {
	ID         int64          `json:"id"`
	ProjectID  string         `json:"projectId"`
	Service    string         `json:"service"`
	Version    string         `json:"version,omitempty"`
	ChangeType string         `json:"changeType"`
	Metadata   map[string]any `json:"metadata"`
	DeployedAt time.Time      `json:"deployedAt"`
}

// ServiceBaseline holds rolling RED metrics for anomaly detection.
type ServiceBaseline struct {
	ProjectID  string    `json:"projectId"`
	Service    string    `json:"service"`
	WindowMin  int       `json:"windowMin"`
	ErrorRate  float64   `json:"errorRate"`
	P50US      int64     `json:"p50Us"`
	P95US      int64     `json:"p95Us"`
	P99US      int64     `json:"p99Us"`
	Throughput float64   `json:"throughput"`
	UpdatedAt  time.Time `json:"updatedAt"`
}

// IntelligenceOverview is the system health summary for the home page.
type IntelligenceOverview struct {
	SystemStatus      string     `json:"systemStatus"`
	ActiveIncidents   int        `json:"activeIncidents"`
	CriticalIncidents int        `json:"criticalIncidents"`
	TopImpacted       string     `json:"topImpactedService,omitempty"`
	Insight           string     `json:"insight"`
	RecentIncidents   []Incident `json:"recentIncidents,omitempty"`
}
