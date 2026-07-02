// Package seed generates demo trace data for the public demo project.
package seed

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math"
	mrand "math/rand"
	"net/http"
	"time"
)

// Demo sends count synthetic traces to the OTLP HTTP endpoint for project demo.
func Demo(endpoint, project string, count int) error {
	rng := mrand.New(mrand.NewSource(time.Now().UnixNano()))
	for i := 0; i < count; i++ {
		start := time.Now().Add(-time.Duration(rng.Int63n(int64(45 * time.Minute))))
		payload := buildTrace(rng, start, project)
		body, _ := json.Marshal(payload)
		req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
		if err != nil {
			return err
		}
		req.Header.Set("Content-Type", "application/json")
		resp, err := http.DefaultClient.Do(req)
		if err != nil {
			return err
		}
		resp.Body.Close()
		if resp.StatusCode >= 300 {
			return fmt.Errorf("seed status %d", resp.StatusCode)
		}
	}
	return nil
}

type opSpec struct {
	service, operation string
	kind               int
	baseMs, jitterMs   float64
	errorRate          float64
	children           []opSpec
}

func topology() opSpec {
	return opSpec{
		service: "api-gateway", operation: "POST /checkout", kind: 2, baseMs: 8, jitterMs: 6, errorRate: 0.01,
		children: []opSpec{
			{service: "checkout", operation: "CreateOrder", kind: 2, baseMs: 12, jitterMs: 10, errorRate: 0.02,
				children: []opSpec{
					{service: "inventory", operation: "ReserveStock", kind: 2, baseMs: 20, jitterMs: 25, errorRate: 0.05,
						children: []opSpec{
							{service: "postgres", operation: "UPDATE inventory", kind: 3, baseMs: 6, jitterMs: 12, errorRate: 0.01},
						}},
					{service: "payments", operation: "ChargeCard", kind: 2, baseMs: 90, jitterMs: 140, errorRate: 0.08,
						children: []opSpec{
							{service: "stripe-adapter", operation: "POST /v1/charges", kind: 3, baseMs: 70, jitterMs: 120, errorRate: 0.06},
						}},
					{service: "notifications", operation: "SendReceipt", kind: 4, baseMs: 15, jitterMs: 30, errorRate: 0.03},
				}},
		},
	}
}

type otlpRequest struct {
	ResourceSpans []otlpResourceSpans `json:"resourceSpans"`
}
type otlpResourceSpans struct {
	Resource   otlpResource     `json:"resource"`
	ScopeSpans []otlpScopeSpans `json:"scopeSpans"`
}
type otlpResource struct {
	Attributes []otlpKeyValue `json:"attributes"`
}
type otlpScopeSpans struct {
	Spans []otlpSpan `json:"spans"`
}
type otlpSpan struct {
	TraceID, SpanID, ParentSpanID, Name string
	Kind                                int
	StartTimeUnixNano, EndTimeUnixNano  string
	Attributes                          []otlpKeyValue
	Events                              []otlpEvent
	Status                              otlpStatus
}
type otlpEvent struct {
	TimeUnixNano string         `json:"timeUnixNano"`
	Name         string         `json:"name"`
	Attributes   []otlpKeyValue `json:"attributes,omitempty"`
}
type otlpStatus struct {
	Code    int    `json:"code"`
	Message string `json:"message,omitempty"`
}
type otlpKeyValue struct {
	Key   string       `json:"key"`
	Value otlpAnyValue `json:"value"`
}
type otlpAnyValue struct {
	StringValue *string `json:"stringValue,omitempty"`
}

func buildTrace(rng *mrand.Rand, start time.Time, project string) otlpRequest {
	traceID := randHex(16)
	spec := topology()
	byService := map[string][]otlpSpan{}
	buildSpan(rng, traceID, "", spec, start, byService)
	var rs []otlpResourceSpans
	for svc, spans := range byService {
		env := "demo"
		if project != "demo" {
			env = project
		}
		rs = append(rs, otlpResourceSpans{
			Resource: otlpResource{Attributes: []otlpKeyValue{
				kvStr("service.name", svc),
				kvStr("deployment.environment", env),
			}},
			ScopeSpans: []otlpScopeSpans{{Spans: spans}},
		})
	}
	return otlpRequest{ResourceSpans: rs}
}

func buildSpan(rng *mrand.Rand, traceID, parentID string, spec opSpec, start time.Time, out map[string][]otlpSpan) time.Duration {
	spanID := randHex(8)
	self := time.Duration((spec.baseMs + math.Abs(rng.NormFloat64())*spec.jitterMs) * float64(time.Millisecond))
	childStart := start.Add(2 * time.Millisecond)
	var childrenTotal time.Duration
	for _, child := range spec.children {
		d := buildSpan(rng, traceID, spanID, child, childStart, out)
		childStart = childStart.Add(d)
		childrenTotal += d
	}
	total := self + childrenTotal
	end := start.Add(total)
	isError := rng.Float64() < spec.errorRate
	status := otlpStatus{Code: 0}
	if isError {
		status = otlpStatus{Code: 2, Message: "operation failed"}
	}
	span := otlpSpan{
		TraceID: traceID, SpanID: spanID, ParentSpanID: parentID, Name: spec.operation, Kind: spec.kind,
		StartTimeUnixNano: fmt.Sprintf("%d", start.UnixNano()),
		EndTimeUnixNano:   fmt.Sprintf("%d", end.UnixNano()),
		Status:            status,
	}
	out[spec.service] = append(out[spec.service], span)
	return total
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
func kvStr(k, v string) otlpKeyValue {
	return otlpKeyValue{Key: k, Value: otlpAnyValue{StringValue: &v}}
}
