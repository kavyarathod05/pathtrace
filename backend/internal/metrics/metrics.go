// Package metrics exposes Prometheus counters for PathTrace operations.
package metrics

import (
	"net/http"

	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	SpansReceived = promauto.NewCounter(prometheus.CounterOpts{
		Name: "pathtrace_spans_received_total",
		Help: "Total spans accepted at ingest (before sampling).",
	})
	SpansSampled = promauto.NewCounter(prometheus.CounterOpts{
		Name: "pathtrace_spans_kept_total",
		Help: "Total spans kept after head sampling.",
	})
	SpansWritten = promauto.NewCounter(prometheus.CounterOpts{
		Name: "pathtrace_spans_written_total",
		Help: "Total spans persisted to storage.",
	})
	IngestRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "pathtrace_ingest_requests_total",
		Help: "Ingest HTTP/gRPC requests by status.",
	}, []string{"protocol", "status"})
	HTTPRequests = promauto.NewCounterVec(prometheus.CounterOpts{
		Name: "pathtrace_http_requests_total",
		Help: "HTTP API requests by route pattern and status.",
	}, []string{"route", "status"})
)

// Handler serves GET /metrics in Prometheus text format.
func Handler() http.Handler { return promhttp.Handler() }
