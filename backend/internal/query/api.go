// Package query exposes the PathTrace HTTP API: OTLP ingestion, trace search
// and retrieval, analytics (dependencies, health, hotspots, facets), alert
// management, and the Live Tail SSE stream.
package query

import (
	"encoding/json"
	"io"
	"net/http"
	"strconv"
	"time"

	"github.com/pathtrace/pathtrace/internal/analytics"
	"github.com/pathtrace/pathtrace/internal/config"
	"github.com/pathtrace/pathtrace/internal/ingest"
	"github.com/pathtrace/pathtrace/internal/livetail"
	"github.com/pathtrace/pathtrace/internal/metrics"
	"github.com/pathtrace/pathtrace/internal/model"
	"github.com/pathtrace/pathtrace/internal/ratelimit"
	"github.com/pathtrace/pathtrace/internal/storage/postgres"
)

// API wires the HTTP handlers to their dependencies.
type API struct {
	cfg      config.Config
	store    *postgres.Store
	engine   *analytics.Engine
	writer   *ingest.Writer
	pipeline *ingest.Pipeline
	hub      *livetail.Hub
	limiter  *ratelimit.Limiter
}

// New constructs the API.
func New(cfg config.Config, store *postgres.Store, engine *analytics.Engine, writer *ingest.Writer, pipeline *ingest.Pipeline, hub *livetail.Hub, limiter *ratelimit.Limiter) *API {
	return &API{cfg: cfg, store: store, engine: engine, writer: writer, pipeline: pipeline, hub: hub, limiter: limiter}
}

// Handler returns the fully-routed HTTP handler (with CORS).
func (a *API) Handler() http.Handler {
	mux := http.NewServeMux()

	mux.HandleFunc("GET /healthz", a.handleHealth)
	mux.Handle("GET /metrics", metrics.Handler())

	if a.cfg.IngestEnabled() {
		mux.HandleFunc("POST /v1/traces", a.handleIngest)
	}
	if a.cfg.QueryEnabled() {
		mux.HandleFunc("GET /api/projects", a.handleProjects)
		mux.HandleFunc("GET /api/connect", a.handleConnect)
		mux.HandleFunc("GET /api/services", a.handleServices)
		mux.HandleFunc("GET /api/operations", a.handleOperations)
		mux.HandleFunc("GET /api/traces", a.handleSearch)
		mux.HandleFunc("GET /api/traces/{traceID}", a.handleGetTrace)
		mux.HandleFunc("GET /api/dependencies", a.handleDependencies)
		mux.HandleFunc("GET /api/health/services", a.handleServiceHealth)
		mux.HandleFunc("GET /api/hotspots", a.handleHotspots)
		mux.HandleFunc("GET /api/facets", a.handleFacets)
		mux.HandleFunc("GET /api/alerts", a.handleListAlerts)
		mux.HandleFunc("POST /api/alerts", a.handleCreateAlert)
		mux.HandleFunc("DELETE /api/alerts/{id}", a.handleDeleteAlert)
		mux.HandleFunc("GET /api/alerts/events", a.handleAlertEvents)
		mux.HandleFunc("GET /api/live", a.handleLiveTail)
	}

	return a.withCORS(mux)
}

// ---- middleware & helpers ----

func (a *API) withCORS(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", a.cfg.CORSOrigin)
		w.Header().Set("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type,x-pathtrace-key")
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

func writeErr(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

func (a *API) project(r *http.Request) string {
	if p := r.URL.Query().Get("project"); p != "" {
		return p
	}
	if a.cfg.DemoProject != "" {
		return a.cfg.DemoProject
	}
	return "default"
}

func parseWindow(r *http.Request, def time.Duration) time.Duration {
	raw := r.URL.Query().Get("window")
	if raw == "" {
		return def
	}
	if d, err := time.ParseDuration(raw); err == nil {
		return d
	}
	// Allow bare seconds.
	if n, err := strconv.Atoi(raw); err == nil {
		return time.Duration(n) * time.Second
	}
	return def
}

// ---- handlers ----

func (a *API) handleHealth(w http.ResponseWriter, r *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":      "ok",
		"role":        string(a.cfg.Role),
		"subscribers": a.hub.SubscriberCount(),
		"sampleRate":  a.cfg.SampleRate,
		"demoProject": a.cfg.DemoProject,
		"time":        time.Now().UTC(),
	})
}

func (a *API) handleIngest(w http.ResponseWriter, r *http.Request) {
	key := r.Header.Get("x-pathtrace-key")
	if !a.limiter.Allow(key) {
		metrics.IngestRequests.WithLabelValues("http", "429").Inc()
		writeErr(w, http.StatusTooManyRequests, ingest.HTTPErrRateLimited.Error())
		return
	}
	project, ok := a.cfg.ProjectForKey(key)
	if !ok {
		metrics.IngestRequests.WithLabelValues("http", "401").Inc()
		writeErr(w, http.StatusUnauthorized, ingest.HTTPErrUnauthorized.Error())
		return
	}
	body, err := io.ReadAll(io.LimitReader(r.Body, 8<<20))
	if err != nil {
		writeErr(w, http.StatusBadRequest, "read body")
		return
	}
	spans, err := ingest.Parse(body, project)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "parse otlp: "+err.Error())
		return
	}
	a.pipeline.Accept(spans)
	metrics.IngestRequests.WithLabelValues("http", "202").Inc()
	writeJSON(w, http.StatusAccepted, map[string]any{"accepted": len(spans), "project": project})
}

func (a *API) handleProjects(w http.ResponseWriter, r *http.Request) {
	seen := map[string]struct{}{}
	for _, p := range a.cfg.ListProjects() {
		seen[p] = struct{}{}
	}
	fromDB, err := a.store.ListProjects(r.Context())
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	for _, p := range fromDB {
		seen[p] = struct{}{}
	}
	out := make([]string, 0, len(seen))
	for p := range seen {
		out = append(out, p)
	}
	writeJSON(w, http.StatusOK, map[string]any{"projects": out, "demo": a.cfg.DemoProject})
}

func (a *API) handleConnect(w http.ResponseWriter, r *http.Request) {
	keys := []map[string]string{}
	for k, proj := range a.cfg.IngestKeys {
		keys = append(keys, map[string]string{"key": k, "project": proj})
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"httpEndpoint":  a.cfg.PublicURL + "/v1/traces",
		"grpcEndpoint":  a.cfg.PublicURL, // host; grpc port separate
		"grpcPort":      a.cfg.GRPCPort,
		"header":        "x-pathtrace-key",
		"demoProject":   a.cfg.DemoProject,
		"viewParam":     "?project=" + a.cfg.DemoProject,
		"ingestKeys":    keys,
		"otelEnvExample": map[string]string{
			"OTEL_EXPORTER_OTLP_ENDPOINT": a.cfg.PublicURL,
			"OTEL_EXPORTER_OTLP_PROTOCOL": "http/protobuf",
		},
	})
}

func (a *API) handleServices(w http.ResponseWriter, r *http.Request) {
	svcs, err := a.store.Services(r.Context(), a.project(r))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": svcs})
}

func (a *API) handleOperations(w http.ResponseWriter, r *http.Request) {
	service := r.URL.Query().Get("service")
	if service == "" {
		writeErr(w, http.StatusBadRequest, "service is required")
		return
	}
	ops, err := a.store.Operations(r.Context(), a.project(r), service)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"operations": ops})
}

func (a *API) handleSearch(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	tq := model.TraceQuery{
		ProjectID:  a.project(r),
		Service:    q.Get("service"),
		Operation:  q.Get("operation"),
		OnlyErrors: q.Get("onlyErrors") == "true",
		Tags:       parseTags(q.Get("tags")),
		Limit:      atoiDefault(q.Get("limit"), 20),
	}
	tq.MinDuration = parseDurationUS(q.Get("minDuration"))
	tq.MaxDuration = parseDurationUS(q.Get("maxDuration"))
	if v := q.Get("start"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			tq.Start = t
		}
	}
	if v := q.Get("end"); v != "" {
		if t, err := time.Parse(time.RFC3339, v); err == nil {
			tq.End = t
		}
	}
	// Default to the last hour if no time range is given.
	if tq.Start.IsZero() && tq.End.IsZero() {
		tq.Start = time.Now().Add(-1 * time.Hour)
	}

	ids, err := a.store.FindTraceIDs(r.Context(), tq)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	traces, err := a.store.GetTraces(r.Context(), tq.ProjectID, ids)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	summaries := make([]model.TraceSummary, 0, len(traces))
	for _, t := range traces {
		summaries = append(summaries, t.Summary)
	}
	writeJSON(w, http.StatusOK, map[string]any{"traces": summaries, "total": len(summaries)})
}

func (a *API) handleGetTrace(w http.ResponseWriter, r *http.Request) {
	id := r.PathValue("traceID")
	trace, err := a.store.GetTrace(r.Context(), a.project(r), id)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	if trace == nil {
		writeErr(w, http.StatusNotFound, "trace not found")
		return
	}
	writeJSON(w, http.StatusOK, trace)
}

func (a *API) handleDependencies(w http.ResponseWriter, r *http.Request) {
	edges, err := a.engine.Dependencies(r.Context(), a.project(r), parseWindow(r, time.Hour))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"edges": edges})
}

func (a *API) handleServiceHealth(w http.ResponseWriter, r *http.Request) {
	health, err := a.engine.ServiceHealth(r.Context(), a.project(r), parseWindow(r, time.Hour))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"services": health})
}

func (a *API) handleHotspots(w http.ResponseWriter, r *http.Request) {
	spots, err := a.engine.Hotspots(r.Context(), a.project(r), parseWindow(r, time.Hour), atoiDefault(r.URL.Query().Get("limit"), 20))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"hotspots": spots})
}

func (a *API) handleFacets(w http.ResponseWriter, r *http.Request) {
	tag := r.URL.Query().Get("tag")
	if tag == "" {
		writeErr(w, http.StatusBadRequest, "tag is required")
		return
	}
	facets, err := a.engine.Facets(r.Context(), a.project(r), tag, parseWindow(r, time.Hour), atoiDefault(r.URL.Query().Get("limit"), 20))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"facets": facets})
}

func (a *API) handleListAlerts(w http.ResponseWriter, r *http.Request) {
	rules, err := a.store.ListAlertRules(r.Context(), a.project(r))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"rules": rules})
}

func (a *API) handleCreateAlert(w http.ResponseWriter, r *http.Request) {
	var rule model.AlertRule
	if err := json.NewDecoder(io.LimitReader(r.Body, 1<<20)).Decode(&rule); err != nil {
		writeErr(w, http.StatusBadRequest, "invalid body")
		return
	}
	rule.ProjectID = a.project(r)
	if rule.Name == "" || rule.Metric == "" || rule.Op == "" {
		writeErr(w, http.StatusBadRequest, "name, metric and op are required")
		return
	}
	id, err := a.store.CreateAlertRule(r.Context(), rule)
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	rule.ID = id
	writeJSON(w, http.StatusCreated, rule)
}

func (a *API) handleDeleteAlert(w http.ResponseWriter, r *http.Request) {
	id, err := strconv.ParseInt(r.PathValue("id"), 10, 64)
	if err != nil {
		writeErr(w, http.StatusBadRequest, "invalid id")
		return
	}
	if err := a.store.DeleteAlertRule(r.Context(), a.project(r), id); err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (a *API) handleAlertEvents(w http.ResponseWriter, r *http.Request) {
	events, err := a.store.RecentAlertEvents(r.Context(), a.project(r), atoiDefault(r.URL.Query().Get("limit"), 50))
	if err != nil {
		writeErr(w, http.StatusInternalServerError, err.Error())
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"events": events})
}

func (a *API) handleLiveTail(w http.ResponseWriter, r *http.Request) {
	flusher, ok := w.(http.Flusher)
	if !ok {
		writeErr(w, http.StatusInternalServerError, "streaming unsupported")
		return
	}
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")

	ch, unsubscribe := a.hub.Subscribe()
	defer unsubscribe()

	// Initial comment to open the stream promptly.
	_, _ = w.Write([]byte(": connected\n\n"))
	flusher.Flush()

	keepalive := time.NewTicker(15 * time.Second)
	defer keepalive.Stop()

	enc := json.NewEncoder(w)
	for {
		select {
		case <-r.Context().Done():
			return
		case <-keepalive.C:
			_, _ = w.Write([]byte(": keepalive\n\n"))
			flusher.Flush()
		case sp, ok := <-ch:
			if !ok {
				return
			}
			_, _ = w.Write([]byte("data: "))
			_ = enc.Encode(sp) // Encode writes a trailing newline.
			_, _ = w.Write([]byte("\n"))
			flusher.Flush()
		}
	}
}
