package ingest

import (
	"context"
	"log"
	"time"

	"github.com/pathtrace/pathtrace/internal/livetail"
	"github.com/pathtrace/pathtrace/internal/metrics"
	"github.com/pathtrace/pathtrace/internal/model"
	"github.com/pathtrace/pathtrace/internal/queue"
	"github.com/pathtrace/pathtrace/internal/sampling"
)

// Pipeline routes accepted spans to direct persistence or a Redis buffer
// depending on deployment role.
type Pipeline struct {
	sampler *sampling.Sampler
	writer  *Writer
	bridge  *queue.Bridge
}

// NewPipeline wires the ingest path. bridge may be nil for all-in-one mode.
func NewPipeline(sampler *sampling.Sampler, writer *Writer, bridge *queue.Bridge) *Pipeline {
	return &Pipeline{sampler: sampler, writer: writer, bridge: bridge}
}

// Accept applies sampling and forwards spans downstream.
func (p *Pipeline) Accept(spans []model.Span) {
	if len(spans) == 0 {
		return
	}
	metrics.SpansReceived.Add(float64(len(spans)))
	kept := make([]model.Span, 0, len(spans))
	for _, sp := range spans {
		if p.sampler.Keep(sp.TraceID) {
			kept = append(kept, sp)
		}
	}
	if len(kept) == 0 {
		return
	}
	metrics.SpansSampled.Add(float64(len(kept)))

	if p.bridge != nil {
		ctx := context.Background()
		if err := p.bridge.Push(ctx, kept); err != nil {
			log.Printf("ingest: redis push failed: %v", err)
		}
		return
	}
	p.writer.Persist(kept)
}

// StartRedisWorker drains the Redis queue into the writer (query role).
func StartRedisWorker(ctx context.Context, bridge *queue.Bridge, writer *Writer) {
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			default:
			}
			spans, err := bridge.PopBatch(ctx, 2*time.Second)
			if err != nil {
				log.Printf("ingest: redis pop: %v", err)
				continue
			}
			if len(spans) > 0 {
				writer.Persist(spans)
			}
		}
	}()
}

// StartRedisLiveRelay forwards Redis pub/sub spans into the local live-tail hub.
func StartRedisLiveRelay(ctx context.Context, bridge *queue.Bridge, hub *livetail.Hub) {
	ch, unsub, err := bridge.SubscribeLive(ctx)
	if err != nil {
		log.Printf("ingest: redis live subscribe: %v", err)
		return
	}
	defer unsub()
	go func() {
		for {
			select {
			case <-ctx.Done():
				return
			case sp, ok := <-ch:
				if !ok {
					return
				}
				hub.Publish(sp)
			}
		}
	}()
}
