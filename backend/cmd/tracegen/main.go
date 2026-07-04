// Command tracegen produces realistic demo traces and sends them to a running
// PathTrace server via the OTLP/HTTP JSON endpoint. It simulates a small
// e-commerce system (gateway -> checkout -> payments/inventory -> db) so the
// UI has interesting service maps, latencies, and errors to display.
package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"math"
	mrand "math/rand"
	"net/http"
	"time"
)

func main() {
	endpoint := flag.String("endpoint", "http://localhost:8080/v1/traces", "OTLP HTTP traces endpoint")
	count := flag.Int("count", 600, "number of traces to generate")
	key := flag.String("key", "", "ingest key (x-pathtrace-key)")
	spread := flag.Duration("spread", 24*time.Hour, "spread trace start times across this past window")
	flag.Parse()

	log.SetPrefix("[tracegen] ")
	rng := mrand.New(mrand.NewSource(time.Now().UnixNano()))

	sent := 0
	for i := 0; i < *count; i++ {
		// Bias start times toward recent (r*r) so every UI time window has data.
		r := rng.Float64()
		startedAgo := time.Duration(r * r * float64(*spread))
		start := time.Now().Add(-startedAgo)
		payload := buildTrace(rng, start)
		if err := post(*endpoint, *key, payload); err != nil {
			log.Fatalf("send trace: %v", err)
		}
		sent++
		if sent%50 == 0 {
			log.Printf("sent %d/%d traces", sent, *count)
		}
	}
	log.Printf("done: sent %d traces to %s", sent, *endpoint)
}

// ---- topology ----

type opSpec struct {
	service   string
	operation string
	kind      int
	baseMs    float64
	jitterMs  float64
	errorRate float64
	children  []opSpec
}

// A realistic call tree for one user request.
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

var deploymentVersions = map[string]string{
	"api-gateway":     "v2.4.1",
	"checkout":        "v1.8.0",
	"inventory":       "v3.1.2",
	"payments":        "v2.0.5",
	"stripe-adapter":  "v1.2.0",
	"notifications":   "v1.5.3",
	"postgres":        "v14.2",
}

var exceptionTypes = []string{
	"TimeoutException",
	"PaymentDeclined",
	"InventoryConflict",
	"UpstreamError",
	"ConnectionReset",
}

// ---- OTLP building ----

func buildTrace(rng *mrand.Rand, start time.Time) otlpRequest {
	traceID := randHex(16)
	spec := topology()
	byService := map[string][]otlpSpan{}
	buildSpan(rng, traceID, "", spec, start, byService)

	var resourceSpans []otlpResourceSpans
	for svc, spans := range byService {
		attrs := []otlpKeyValue{
			kvStr("service.name", svc),
			kvStr("deployment.environment", "demo"),
		}
		if ver, ok := deploymentVersions[svc]; ok {
			attrs = append(attrs, kvStr("deployment.version", ver))
		}
		resourceSpans = append(resourceSpans, otlpResourceSpans{
			Resource: otlpResource{Attributes: attrs},
			ScopeSpans: []otlpScopeSpans{{Spans: spans}},
		})
	}
	return otlpRequest{ResourceSpans: resourceSpans}
}

// buildSpan recursively creates spans and returns the span's own duration.
func buildSpan(rng *mrand.Rand, traceID, parentID string, spec opSpec, start time.Time, out map[string][]otlpSpan) time.Duration {
	spanID := randHex(8)
	self := time.Duration((spec.baseMs + math.Abs(rng.NormFloat64())*spec.jitterMs) * float64(time.Millisecond))

	// Children run sequentially after a tiny offset.
	childStart := start.Add(2 * time.Millisecond)
	var childrenTotal time.Duration
	anyChildError := false
	for _, child := range spec.children {
		d := buildSpan(rng, traceID, spanID, child, childStart, out)
		childStart = childStart.Add(d)
		childrenTotal += d
	}
	total := self + childrenTotal
	end := start.Add(total)

	isError := rng.Float64() < spec.errorRate || anyChildError
	status := otlpStatus{Code: 0}
	attrs := []otlpKeyValue{
		kvStr("span.kind.name", kindName(spec.kind)),
		kvInt("http.request.size", int64(rng.Intn(2048))),
	}
	if spec.operation[0] == 'P' || spec.operation[0] == 'G' { // rough HTTP heuristic
		attrs = append(attrs, kvStr("http.route", spec.operation))
	}
	if isError {
		status = otlpStatus{Code: 2, Message: "operation failed"}
		exType := exceptionTypes[rng.Intn(len(exceptionTypes))]
		attrs = append(attrs,
			kvStr("error.type", "UpstreamError"),
			kvStr("exception.type", exType),
		)
	}

	span := otlpSpan{
		TraceID:           traceID,
		SpanID:            spanID,
		ParentSpanID:      parentID,
		Name:              spec.operation,
		Kind:              spec.kind,
		StartTimeUnixNano: fmt.Sprintf("%d", start.UnixNano()),
		EndTimeUnixNano:   fmt.Sprintf("%d", end.UnixNano()),
		Attributes:        attrs,
		Status:            status,
	}
	if isError {
		exType := exceptionTypes[rng.Intn(len(exceptionTypes))]
		span.Events = []otlpEvent{{
			TimeUnixNano: fmt.Sprintf("%d", start.Add(self).UnixNano()),
			Name:         "exception",
			Attributes: []otlpKeyValue{
				kvStr("exception.message", "operation failed"),
				kvStr("exception.type", exType),
			},
		}}
	}
	out[spec.service] = append(out[spec.service], span)
	return total
}

func kindName(k int) string {
	switch k {
	case 2:
		return "server"
	case 3:
		return "client"
	case 4:
		return "producer"
	default:
		return "internal"
	}
}

func post(endpoint, key string, payload otlpRequest) error {
	body, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	req, err := http.NewRequest(http.MethodPost, endpoint, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if key != "" {
		req.Header.Set("x-pathtrace-key", key)
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("unexpected status %d", resp.StatusCode)
	}
	return nil
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}

// ---- OTLP JSON structs (mirror the ingest parser) ----

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
	TraceID           string         `json:"traceId"`
	SpanID            string         `json:"spanId"`
	ParentSpanID      string         `json:"parentSpanId,omitempty"`
	Name              string         `json:"name"`
	Kind              int            `json:"kind"`
	StartTimeUnixNano string         `json:"startTimeUnixNano"`
	EndTimeUnixNano   string         `json:"endTimeUnixNano"`
	Attributes        []otlpKeyValue `json:"attributes,omitempty"`
	Events            []otlpEvent    `json:"events,omitempty"`
	Status            otlpStatus     `json:"status"`
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
	IntValue    *string `json:"intValue,omitempty"`
}

func kvStr(k, v string) otlpKeyValue {
	return otlpKeyValue{Key: k, Value: otlpAnyValue{StringValue: &v}}
}
func kvInt(k string, v int64) otlpKeyValue {
	s := fmt.Sprintf("%d", v)
	return otlpKeyValue{Key: k, Value: otlpAnyValue{IntValue: &s}}
}
