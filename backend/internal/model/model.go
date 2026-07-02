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
	ID        int64   `json:"id"`
	ProjectID string  `json:"projectId"`
	Name      string  `json:"name"`
	Service   string  `json:"service,omitempty"`
	Metric    string  `json:"metric"` // p95_latency_us | error_rate
	Op        string  `json:"op"`     // > | <
	Threshold float64 `json:"threshold"`
	WindowSec int     `json:"windowSec"`
}

// AlertEvent is a recorded firing of an alert rule.
type AlertEvent struct {
	ID        int64     `json:"id"`
	RuleID    int64     `json:"ruleId"`
	RuleName  string    `json:"ruleName"`
	Service   string    `json:"service,omitempty"`
	Metric    string    `json:"metric"`
	FiredAt   time.Time `json:"firedAt"`
	Value     float64   `json:"value"`
	Threshold float64   `json:"threshold"`
}
