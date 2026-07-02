// Package livetail provides an in-process publish/subscribe hub used to stream
// newly ingested spans to connected clients over Server-Sent Events. Because
// the free-tier deployment is a single instance, an in-memory hub is enough;
// no external broker is required.
package livetail

import (
	"sync"

	"github.com/pathtrace/pathtrace/internal/model"
)

// Hub fans out spans to all active subscribers. Slow subscribers drop messages
// rather than block the ingest path (bounded per-subscriber buffer).
type Hub struct {
	mu   sync.RWMutex
	subs map[int]chan model.Span
	next int
}

// NewHub creates an empty hub.
func NewHub() *Hub {
	return &Hub{subs: make(map[int]chan model.Span)}
}

// Subscribe registers a new subscriber and returns its channel plus an
// unsubscribe function that must be called when the client disconnects.
func (h *Hub) Subscribe() (<-chan model.Span, func()) {
	h.mu.Lock()
	defer h.mu.Unlock()
	id := h.next
	h.next++
	ch := make(chan model.Span, 256)
	h.subs[id] = ch
	return ch, func() {
		h.mu.Lock()
		defer h.mu.Unlock()
		if c, ok := h.subs[id]; ok {
			close(c)
			delete(h.subs, id)
		}
	}
}

// Publish broadcasts a span to all subscribers without blocking.
func (h *Hub) Publish(spans ...model.Span) {
	h.mu.RLock()
	defer h.mu.RUnlock()
	for _, sp := range spans {
		for _, ch := range h.subs {
			select {
			case ch <- sp:
			default:
				// Subscriber buffer full: drop to protect ingest throughput.
			}
		}
	}
}

// SubscriberCount reports how many clients are currently attached.
func (h *Hub) SubscriberCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.subs)
}
