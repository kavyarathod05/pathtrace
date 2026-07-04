package livetail

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	mrand "math/rand"
	"math"
	"time"

	"github.com/pathtrace/pathtrace/internal/model"
	"github.com/pathtrace/pathtrace/internal/storage/postgres"
)

// StartDemoFeed publishes synthetic live spans for the demo project so Live Tail
// stays active in production when no real OTLP traffic is flowing.
func StartDemoFeed(ctx context.Context, hub *Hub, store *postgres.Store, project string) {
	if project == "" || hub == nil {
		return
	}
	go (&demoFeed{hub: hub, store: store, project: project, rng: mrand.New(mrand.NewSource(time.Now().UnixNano()))}).run(ctx)
}

type demoFeed struct {
	hub     *Hub
	store   *postgres.Store
	project string
	rng     *mrand.Rand
}

func (f *demoFeed) run(ctx context.Context) {
	// Brief delay so demo seed can populate the replay pool.
	select {
	case <-ctx.Done():
		return
	case <-time.After(2 * time.Second):
	}

	traces := f.loadTraces(ctx)
	log.Printf("livetail: demo feed started for project %q (%d traces in pool)", f.project, len(traces))

	for {
		if len(traces) == 0 {
			traces = f.syntheticTraces()
		}

		trace := traces[f.rng.Intn(len(traces))]
		for _, sp := range trace {
			live := sp
			live.ProjectID = f.project
			live.StartTime = time.Now().UTC()
			f.hub.Publish(live)

			delay := time.Duration(60+f.rng.Intn(140)) * time.Millisecond
			select {
			case <-ctx.Done():
				return
			case <-time.After(delay):
			}
		}

		gap := time.Duration(600+f.rng.Intn(1400)) * time.Millisecond
		select {
		case <-ctx.Done():
			return
		case <-time.After(gap):
		}

		// Refresh replay pool periodically so new seeded data appears.
		if f.rng.Float64() < 0.08 {
			if loaded := f.loadTraces(ctx); len(loaded) > 0 {
				traces = loaded
			}
		}
	}
}

func (f *demoFeed) loadTraces(ctx context.Context) [][]model.Span {
	if f.store == nil {
		return nil
	}
	loadCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	spans, err := f.store.RecentTraceSpans(loadCtx, f.project, 24, 8)
	if err != nil || len(spans) == 0 {
		return nil
	}
	byTrace := map[string][]model.Span{}
	var order []string
	for _, sp := range spans {
		if _, ok := byTrace[sp.TraceID]; !ok {
			order = append(order, sp.TraceID)
		}
		byTrace[sp.TraceID] = append(byTrace[sp.TraceID], sp)
	}
	out := make([][]model.Span, 0, len(order))
	for _, id := range order {
		out = append(out, byTrace[id])
	}
	return out
}

func (f *demoFeed) syntheticTraces() [][]model.Span {
	specs := []struct {
		service, operation string
		baseMs, jitterMs   float64
		errRate            float64
	}{
		{"api-gateway", "POST /checkout", 8, 6, 0.01},
		{"checkout", "CreateOrder", 12, 10, 0.02},
		{"inventory", "ReserveStock", 20, 25, 0.05},
		{"postgres", "UPDATE inventory", 6, 12, 0.01},
		{"payments", "ChargeCard", 90, 140, 0.08},
		{"stripe-adapter", "POST /v1/charges", 70, 120, 0.06},
		{"notifications", "SendReceipt", 15, 30, 0.03},
	}

	traceID := randHex(16)
	start := time.Now().UTC()
	var out []model.Span
	for i, spec := range specs {
		spanID := randHex(8)
		dur := time.Duration((spec.baseMs + math.Abs(f.rng.NormFloat64())*spec.jitterMs) * float64(time.Millisecond))
		isErr := f.rng.Float64() < spec.errRate
		status := ""
		if isErr {
			status = "ERROR"
		}
		tags := map[string]any{"span.kind.name": "server"}
		if len(spec.operation) > 0 && (spec.operation[0] == 'P' || spec.operation[0] == 'G') {
			tags["http.route"] = spec.operation
		}
		out = append(out, model.Span{
			ProjectID:     f.project,
			TraceID:       traceID,
			SpanID:        spanID,
			ServiceName:   spec.service,
			OperationName: spec.operation,
			Kind:          "server",
			StartTime:     start.Add(time.Duration(i) * 30 * time.Millisecond),
			DurationUS:    dur.Microseconds(),
			StatusCode:    status,
			Tags:          tags,
		})
	}
	return [][]model.Span{out}
}

func randHex(n int) string {
	b := make([]byte, n)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
