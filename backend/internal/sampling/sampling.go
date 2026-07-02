// Package sampling implements probabilistic head-based sampling. A sampling
// decision is made per trace ID so that either all spans of a trace are kept
// or all are dropped, keeping traces intact.
package sampling

import (
	"hash/fnv"
)

// Sampler decides whether a trace should be stored based on a fixed rate.
type Sampler struct {
	rate float64
}

// New returns a sampler with the given rate in [0,1]. Rate >= 1 keeps
// everything; rate <= 0 also keeps everything (sampling disabled) so local
// dev never silently loses data.
func New(rate float64) *Sampler {
	if rate <= 0 || rate >= 1 {
		rate = 1
	}
	return &Sampler{rate: rate}
}

// Keep returns true if the trace should be stored. The decision is
// deterministic per trace ID: we hash the ID to a value in [0,1) and keep it
// when that value is below the configured rate.
func (s *Sampler) Keep(traceID string) bool {
	if s.rate >= 1 {
		return true
	}
	h := fnv.New64a()
	_, _ = h.Write([]byte(traceID))
	// Map the hash into [0,1).
	frac := float64(h.Sum64()%1_000_000) / 1_000_000.0
	return frac < s.rate
}

// Rate returns the configured sampling rate.
func (s *Sampler) Rate() float64 { return s.rate }
