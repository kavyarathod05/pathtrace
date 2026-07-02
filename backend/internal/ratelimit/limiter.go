// Package ratelimit provides a simple per-key requests-per-minute limiter for
// ingest endpoints. It is in-memory and resets each minute — sufficient for
// a single-instance free-tier deployment.
package ratelimit

import (
	"sync"
	"time"
)

// Limiter tracks request counts per key within a sliding minute window.
type Limiter struct {
	mu    sync.Mutex
	limit int
	buckets map[string]*bucket
}

type bucket struct {
	count int
	reset time.Time
}

// New creates a limiter. limit <= 0 means unlimited.
func New(limit int) *Limiter {
	return &Limiter{limit: limit, buckets: map[string]*bucket{}}
}

// Allow reports whether key may proceed and records the attempt when allowed.
func (l *Limiter) Allow(key string) bool {
	if l.limit <= 0 {
		return true
	}
	if key == "" {
		key = "_anonymous"
	}
	now := time.Now()
	l.mu.Lock()
	defer l.mu.Unlock()
	b, ok := l.buckets[key]
	if !ok || now.After(b.reset) {
		l.buckets[key] = &bucket{count: 1, reset: now.Add(time.Minute)}
		return true
	}
	if b.count >= l.limit {
		return false
	}
	b.count++
	return true
}
