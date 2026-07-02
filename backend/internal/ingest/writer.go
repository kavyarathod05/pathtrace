package ingest

import (
	"context"
	"log"
	"sync"
	"time"

	"github.com/pathtrace/pathtrace/internal/livetail"
	"github.com/pathtrace/pathtrace/internal/metrics"
	"github.com/pathtrace/pathtrace/internal/model"
	"github.com/pathtrace/pathtrace/internal/sampling"
	"github.com/pathtrace/pathtrace/internal/storage/postgres"
)

// Writer buffers spans in memory and flushes them to Postgres in batches,
// applying head sampling and broadcasting kept spans to the live-tail hub.
type Writer struct {
	store   *postgres.Store
	sampler *sampling.Sampler
	hub     *livetail.Hub

	mu      sync.Mutex
	buf     []model.Span
	maxBuf  int
	flushCh chan struct{}
	done    chan struct{}
}

// NewWriter creates a batch writer and starts its background flush loop.
// It flushes when the buffer reaches maxBuf or every flushInterval.
func NewWriter(store *postgres.Store, sampler *sampling.Sampler, hub *livetail.Hub, maxBuf int, flushInterval time.Duration) *Writer {
	if maxBuf <= 0 {
		maxBuf = 500
	}
	w := &Writer{
		store:   store,
		sampler: sampler,
		hub:     hub,
		maxBuf:  maxBuf,
		flushCh: make(chan struct{}, 1),
		done:    make(chan struct{}),
	}
	go w.loop(flushInterval)
	return w
}

// Enqueue applies sampling and persists kept spans (legacy helper).
func (w *Writer) Enqueue(spans []model.Span) {
	kept := spans[:0:0]
	for _, sp := range spans {
		if w.sampler.Keep(sp.TraceID) {
			kept = append(kept, sp)
		}
	}
	w.Persist(kept)
}

// Persist buffers already-sampled spans for batched storage and live tail.
func (w *Writer) Persist(spans []model.Span) {
	if len(spans) == 0 {
		return
	}
	w.hub.Publish(spans...)

	w.mu.Lock()
	w.buf = append(w.buf, spans...)
	full := len(w.buf) >= w.maxBuf
	w.mu.Unlock()

	if full {
		select {
		case w.flushCh <- struct{}{}:
		default:
		}
	}
}

func (w *Writer) loop(interval time.Duration) {
	if interval <= 0 {
		interval = 2 * time.Second
	}
	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case <-w.done:
			w.flush()
			return
		case <-ticker.C:
			w.flush()
		case <-w.flushCh:
			w.flush()
		}
	}
}

func (w *Writer) flush() {
	w.mu.Lock()
	if len(w.buf) == 0 {
		w.mu.Unlock()
		return
	}
	batch := w.buf
	w.buf = nil
	w.mu.Unlock()

	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := w.store.InsertSpans(ctx, batch); err != nil {
		log.Printf("ingest: failed to flush %d spans: %v", len(batch), err)
	} else {
		metrics.SpansWritten.Add(float64(len(batch)))
	}
}

// Close flushes remaining spans and stops the loop.
func (w *Writer) Close() {
	close(w.done)
}
