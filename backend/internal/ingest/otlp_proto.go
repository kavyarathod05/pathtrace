package ingest

import (
	"encoding/hex"
	"time"

	commonpb "go.opentelemetry.io/proto/otlp/common/v1"
	coltracepb "go.opentelemetry.io/proto/otlp/collector/trace/v1"

	"github.com/pathtrace/pathtrace/internal/model"
)

// ParseProto converts an OTLP gRPC ExportTraceServiceRequest into PathTrace spans.
func ParseProto(req *coltracepb.ExportTraceServiceRequest, projectID string) []model.Span {
	var out []model.Span
	for _, rs := range req.GetResourceSpans() {
		resAttrs := attrsProtoToMap(rs.GetResource().GetAttributes())
		serviceName, _ := resAttrs["service.name"].(string)
		if serviceName == "" {
			serviceName = "unknown"
		}
		for _, ss := range rs.GetScopeSpans() {
			for _, s := range ss.GetSpans() {
				start := time.Unix(0, int64(s.GetStartTimeUnixNano())).UTC()
				end := time.Unix(0, int64(s.GetEndTimeUnixNano())).UTC()
				durUS := end.Sub(start).Microseconds()
				if durUS < 0 {
					durUS = 0
				}
				tags := attrsProtoToMap(s.GetAttributes())
				for k, v := range resAttrs {
					if _, ok := tags[k]; !ok {
						tags[k] = v
					}
				}
				events := make([]model.SpanEvent, 0, len(s.GetEvents()))
				for _, ev := range s.GetEvents() {
					events = append(events, model.SpanEvent{
						Time:       time.Unix(0, int64(ev.GetTimeUnixNano())).UTC(),
						Name:       ev.GetName(),
						Attributes: attrsProtoToMap(ev.GetAttributes()),
					})
				}
				refs := make([]model.SpanRef, 0, len(s.GetLinks()))
				for _, l := range s.GetLinks() {
					refs = append(refs, model.SpanRef{
						TraceID: hex.EncodeToString(l.GetTraceId()),
						SpanID:  hex.EncodeToString(l.GetSpanId()),
						Kind:    "link",
					})
				}
				out = append(out, model.Span{
					ProjectID:     projectID,
					TraceID:       hex.EncodeToString(s.GetTraceId()),
					SpanID:        hex.EncodeToString(s.GetSpanId()),
					ParentSpanID:  hex.EncodeToString(s.GetParentSpanId()),
					ServiceName:   serviceName,
					OperationName: s.GetName(),
					Kind:          spanKindNames[int(s.GetKind())],
					StartTime:     start,
					DurationUS:    durUS,
					StatusCode:    statusCodeName(int(s.GetStatus().GetCode())),
					StatusMessage: s.GetStatus().GetMessage(),
					Tags:          tags,
					Events:        events,
					Refs:          refs,
				})
			}
		}
	}
	return out
}

func attrsProtoToMap(kvs []*commonpb.KeyValue) map[string]any {
	m := map[string]any{}
	for _, kv := range kvs {
		if val := anyValueProto(kv.GetValue()); val != nil {
			m[kv.GetKey()] = val
		}
	}
	return m
}

func anyValueProto(v *commonpb.AnyValue) any {
	if v == nil {
		return nil
	}
	switch x := v.GetValue().(type) {
	case *commonpb.AnyValue_StringValue:
		return x.StringValue
	case *commonpb.AnyValue_BoolValue:
		return x.BoolValue
	case *commonpb.AnyValue_IntValue:
		return x.IntValue
	case *commonpb.AnyValue_DoubleValue:
		return x.DoubleValue
	case *commonpb.AnyValue_KvlistValue:
		m := map[string]any{}
		for _, kv := range x.KvlistValue.GetValues() {
			if val := anyValueProto(kv.GetValue()); val != nil {
				m[kv.GetKey()] = val
			}
		}
		return m
	default:
		return nil
	}
}
