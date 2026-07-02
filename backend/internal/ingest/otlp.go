// Package ingest parses incoming OpenTelemetry (OTLP/HTTP JSON) trace payloads
// into PathTrace spans. We decode the OTLP wire format directly rather than
// pulling the full OpenTelemetry proto dependency, keeping the binary small.
package ingest

import (
	"encoding/json"
	"strconv"
	"time"

	"github.com/pathtrace/pathtrace/internal/model"
)

// OTLP/HTTP JSON request shape (subset we care about for tracing).
// Per the OTLP spec, trace_id and span_id are hex-encoded strings in JSON.

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
	ParentSpanID      string         `json:"parentSpanId"`
	Name              string         `json:"name"`
	Kind              int            `json:"kind"`
	StartTimeUnixNano json.Number    `json:"startTimeUnixNano"`
	EndTimeUnixNano   json.Number    `json:"endTimeUnixNano"`
	Attributes        []otlpKeyValue `json:"attributes"`
	Events            []otlpEvent    `json:"events"`
	Links             []otlpLink     `json:"links"`
	Status            otlpStatus     `json:"status"`
}

type otlpEvent struct {
	TimeUnixNano json.Number    `json:"timeUnixNano"`
	Name         string         `json:"name"`
	Attributes   []otlpKeyValue `json:"attributes"`
}

type otlpLink struct {
	TraceID string `json:"traceId"`
	SpanID  string `json:"spanId"`
}

type otlpStatus struct {
	Code    int    `json:"code"` // 0 unset, 1 ok, 2 error
	Message string `json:"message"`
}

type otlpKeyValue struct {
	Key   string       `json:"key"`
	Value otlpAnyValue `json:"value"`
}

type otlpAnyValue struct {
	StringValue *string  `json:"stringValue,omitempty"`
	BoolValue   *bool    `json:"boolValue,omitempty"`
	IntValue    *string  `json:"intValue,omitempty"` // int64 as string in proto-JSON
	DoubleValue *float64 `json:"doubleValue,omitempty"`
}

func (v otlpAnyValue) toGo() any {
	switch {
	case v.StringValue != nil:
		return *v.StringValue
	case v.BoolValue != nil:
		return *v.BoolValue
	case v.IntValue != nil:
		if n, err := strconv.ParseInt(*v.IntValue, 10, 64); err == nil {
			return n
		}
		return *v.IntValue
	case v.DoubleValue != nil:
		return *v.DoubleValue
	default:
		return nil
	}
}

func attrsToMap(kvs []otlpKeyValue) map[string]any {
	m := map[string]any{}
	for _, kv := range kvs {
		if val := kv.Value.toGo(); val != nil {
			m[kv.Key] = val
		}
	}
	return m
}

var spanKindNames = map[int]string{
	0: "unspecified",
	1: "internal",
	2: "server",
	3: "client",
	4: "producer",
	5: "consumer",
}

func statusCodeName(code int) string {
	switch code {
	case 1:
		return "OK"
	case 2:
		return "ERROR"
	default:
		return ""
	}
}

func nanoToTime(n json.Number) time.Time {
	if n == "" {
		return time.Time{}
	}
	i, err := strconv.ParseInt(string(n), 10, 64)
	if err != nil {
		return time.Time{}
	}
	return time.Unix(0, i).UTC()
}

// Parse converts an OTLP/HTTP JSON payload into PathTrace spans, tagging each
// with the given project ID. The service name comes from the resource's
// service.name attribute (falling back to "unknown").
func Parse(body []byte, projectID string) ([]model.Span, error) {
	var req otlpRequest
	if err := json.Unmarshal(body, &req); err != nil {
		return nil, err
	}
	var out []model.Span
	for _, rs := range req.ResourceSpans {
		resAttrs := attrsToMap(rs.Resource.Attributes)
		serviceName, _ := resAttrs["service.name"].(string)
		if serviceName == "" {
			serviceName = "unknown"
		}
		for _, ss := range rs.ScopeSpans {
			for _, s := range ss.Spans {
				start := nanoToTime(s.StartTimeUnixNano)
				end := nanoToTime(s.EndTimeUnixNano)
				durUS := end.Sub(start).Microseconds()
				if durUS < 0 {
					durUS = 0
				}
				tags := attrsToMap(s.Attributes)
				// Merge selected resource attributes so tag search can find them.
				for k, v := range resAttrs {
					if _, exists := tags[k]; !exists {
						tags[k] = v
					}
				}
				events := make([]model.SpanEvent, 0, len(s.Events))
				for _, ev := range s.Events {
					events = append(events, model.SpanEvent{
						Time:       nanoToTime(ev.TimeUnixNano),
						Name:       ev.Name,
						Attributes: attrsToMap(ev.Attributes),
					})
				}
				refs := make([]model.SpanRef, 0, len(s.Links))
				for _, l := range s.Links {
					refs = append(refs, model.SpanRef{TraceID: l.TraceID, SpanID: l.SpanID, Kind: "link"})
				}
				out = append(out, model.Span{
					ProjectID:     projectID,
					TraceID:       s.TraceID,
					SpanID:        s.SpanID,
					ParentSpanID:  s.ParentSpanID,
					ServiceName:   serviceName,
					OperationName: s.Name,
					Kind:          spanKindNames[s.Kind],
					StartTime:     start,
					DurationUS:    durUS,
					StatusCode:    statusCodeName(s.Status.Code),
					StatusMessage: s.Status.Message,
					Tags:          tags,
					Events:        events,
					Refs:          refs,
				})
			}
		}
	}
	return out, nil
}
