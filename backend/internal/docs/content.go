// Package docs serves PathTrace project documentation over HTTP.
package docs

import (
	"encoding/json"
	"net/http"
)

// Param describes a query or body field.
type Param struct {
	Name        string `json:"name"`
	Type        string `json:"type,omitempty"`
	Required    bool   `json:"required,omitempty"`
	Description string `json:"description"`
}

// Endpoint is one HTTP route in the API reference.
type Endpoint struct {
	Method      string  `json:"method"`
	Path        string  `json:"path"`
	Summary     string  `json:"summary"`
	Description string  `json:"description,omitempty"`
	Params      []Param `json:"params,omitempty"`
	Example     string  `json:"example,omitempty"`
}

// EndpointGroup groups related API routes.
type EndpointGroup struct {
	Title     string     `json:"title"`
	Endpoints []Endpoint `json:"endpoints"`
}

// Section is a documentation chapter.
type Section struct {
	ID      string `json:"id"`
	Title   string `json:"title"`
	Content string `json:"content"`
}

// UIRoute documents a frontend screen.
type UIRoute struct {
	Path        string `json:"path"`
	Title       string `json:"title"`
	Description string `json:"description"`
}

// Documentation is the full project documentation payload.
type Documentation struct {
	Title       string          `json:"title"`
	Version     string          `json:"version"`
	Tagline     string          `json:"tagline"`
	Links       Links           `json:"links"`
	Sections    []Section       `json:"sections"`
	EndpointRef []EndpointGroup `json:"endpoints"`
	UIRoutes    []UIRoute       `json:"uiRoutes"`
	EnvVars     []Param         `json:"envVars"`
}

// Links holds public URLs.
type Links struct {
	Frontend string `json:"frontend,omitempty"`
	API      string `json:"api,omitempty"`
	Repo     string `json:"repo,omitempty"`
}

// Build returns the complete documentation structure.
func Build(frontendURL, apiURL string) Documentation {
	return Documentation{
		Title:   "PathTrace",
		Version: "1.0",
		Tagline: "Incident intelligence and distributed tracing for OpenTelemetry",
		Links: Links{
			Frontend: frontendURL,
			API:      apiURL,
			Repo:     "https://github.com/kavyarathod05/pathtrace",
		},
		Sections: []Section{
			overviewSection(),
			architectureSection(),
			intelligenceSection(),
			ingestionSection(),
			localDevSection(),
			deploymentSection(),
		},
		EndpointRef: endpointGroups(),
		UIRoutes:    uiRoutes(),
		EnvVars:     envVars(),
	}
}

func overviewSection() Section {
	return Section{
		ID:    "overview",
		Title: "Overview",
		Content: "PathTrace is an OpenTelemetry-native platform that combines distributed tracing with incident intelligence. " +
			"Send traces over OTLP and PathTrace materializes incidents, root cause analysis, blast radius, timelines, and guided debug playbooks — without Kafka, Elasticsearch, or ClickHouse.\n\n" +
			"What it solves: When checkout is slow or failing, the cause may be in any downstream service. PathTrace follows a request across your entire stack and surfaces which service broke, why, and what to do next.\n\n" +
			"Stack: Go + Postgres backend (Render), Next.js frontend (Vercel), OTLP/HTTP and gRPC ingestion.\n\n" +
			"The public demo project is auto-seeded on startup — no login required.",
	}
}

func architectureSection() Section {
	return Section{
		ID:    "architecture",
		Title: "Architecture",
		Content: "Write path: OTLP spans → API key check → probabilistic sampling → batched Postgres writer → optional Live Tail SSE broadcast.\n\n" +
			"Intelligence pipeline: A maintenance worker (every 5 minutes on Render free tier) rebuilds service dependency edges, updates RED baselines, detects deployments, runs anomaly detection, and materializes incidents with RCA, blast radius, and playbooks.\n\n" +
			"Read path: The Next.js UI calls REST endpoints under /api/*. Incident pages are the primary UX; trace search is evidence drill-down.\n\n" +
			"Storage: Single spans table with JSONB tags/events. Intelligence tables: incidents, incident_events, service_edges, service_baselines, deployments.\n\n" +
			"Multi-tenancy: Per-project ingest keys via x-pathtrace-key header. Query uses ?project= parameter.",
	}
}

func intelligenceSection() Section {
	return Section{
		ID:    "intelligence",
		Title: "Incident Intelligence",
		Content: "PathTrace detects incidents when error rates or latency exceed baselines or absolute thresholds. Each incident includes:\n\n" +
			"• Root cause hypothesis with confidence score and evidence trace IDs\n" +
			"• Blast radius — downstream services affected via dependency graph traversal\n" +
			"• Timeline — incident opened, RCA identified, evidence collected\n" +
			"• Debug Assistant — interactive checklist with deep links to traces, Explorer, and health views\n" +
			"• Playbook — ranked investigation steps generated from telemetry\n\n" +
			"Incident lifecycle: open → investigate via UI → resolved (manual or auto-resolve after stability).\n\n" +
			"Demo bootstrap: When the demo project has telemetry but no open incidents, the engine creates a sample incident so the UI always has data to explore.",
	}
}

func ingestionSection() Section {
	return Section{
		ID:    "ingestion",
		Title: "Connecting Your App",
		Content: "Send OpenTelemetry traces to PathTrace using any OTLP-compatible SDK or collector.\n\n" +
			"HTTP: POST /v1/traces with Content-Type: application/json (OTLP JSON encoding).\n" +
			"gRPC: Port 4317 (protobuf OTLP).\n\n" +
			"Authentication: Set header x-pathtrace-key: <your-key> to route spans to your project. Keys are configured via INGEST_KEYS env var (key1:project1,key2:project2).\n\n" +
			"SDK environment variables:\n" +
			"  OTEL_EXPORTER_OTLP_ENDPOINT=https://your-api.onrender.com\n" +
			"  OTEL_EXPORTER_OTLP_PROTOCOL=http/protobuf\n\n" +
			"Use the Connect page in the UI for copy-paste setup snippets.",
	}
}

func localDevSection() Section {
	return Section{
		ID:    "local",
		Title: "Local Development",
		Content: "Requirements: Go 1.22+, Node 20+\n\n" +
			"Backend (embedded Postgres, no Docker):\n" +
			"  cd backend && go run ./cmd/server\n" +
			"  → http://localhost:8080\n\n" +
			"Seed demo traces:\n" +
			"  cd backend && go run ./cmd/tracegen -count 300\n\n" +
			"Frontend:\n" +
			"  cd frontend && npm install && npm run dev\n" +
			"  → http://localhost:3000\n\n" +
			"Documentation: GET http://localhost:8080/docs (HTML) or GET /api/docs (JSON).",
	}
}

func deploymentSection() Section {
	return Section{
		ID:    "deploy",
		Title: "Deployment",
		Content: "Render (render.yaml): Go web service + managed Postgres + Redis Key Value. Intelligence maintenance runs in-process on a 5-minute ticker (no separate cron on free tier).\n\n" +
			"Vercel: Deploy frontend/ with NEXT_PUBLIC_API_URL pointing to your Render API URL. Set CORS_ORIGIN on Render to your Vercel domain.\n\n" +
			"Health check: GET /healthz\n" +
			"Metrics: GET /metrics (Prometheus format)",
	}
}

func endpointGroups() []EndpointGroup {
	return []EndpointGroup{
		{
			Title: "Health & Meta",
			Endpoints: []Endpoint{
				{Method: "GET", Path: "/healthz", Summary: "Liveness probe"},
				{Method: "GET", Path: "/metrics", Summary: "Prometheus metrics"},
				{Method: "GET", Path: "/api/docs", Summary: "This documentation (JSON)"},
				{Method: "GET", Path: "/docs", Summary: "This documentation (HTML)"},
				{Method: "GET", Path: "/api/projects", Summary: "List known projects"},
				{Method: "GET", Path: "/api/connect", Summary: "OTLP connection info for the Connect page"},
			},
		},
		{
			Title: "Ingestion",
			Endpoints: []Endpoint{
				{
					Method:      "POST",
					Path:        "/v1/traces",
					Summary:     "OTLP/HTTP JSON trace ingest",
					Description: "Accepts OTLP JSON trace payloads. Optional x-pathtrace-key header selects project.",
					Example:     "curl -XPOST $API/v1/traces -H 'content-type: application/json' -d @trace.json",
				},
			},
		},
		{
			Title: "Trace Search",
			Endpoints: []Endpoint{
				{
					Method:  "GET",
					Path:    "/api/traces",
					Summary: "Search traces",
					Params: []Param{
						{Name: "project", Description: "Project ID (default: demo)"},
						{Name: "service", Description: "Filter by service name"},
						{Name: "operation", Description: "Filter by operation"},
						{Name: "onlyErrors", Description: "true to show error traces only"},
						{Name: "minDuration", Description: "Minimum duration in microseconds"},
						{Name: "maxDuration", Description: "Maximum duration in microseconds"},
						{Name: "tags", Description: "Comma-separated k=v tag filters"},
						{Name: "q", Description: "TraceQL query string"},
						{Name: "start", Description: "RFC3339 start time"},
						{Name: "end", Description: "RFC3339 end time"},
						{Name: "limit", Description: "Max results (default 40)"},
					},
				},
				{Method: "GET", Path: "/api/traces/{traceID}", Summary: "Full trace with all spans"},
				{Method: "GET", Path: "/api/services", Summary: "Distinct service names"},
				{Method: "GET", Path: "/api/operations", Summary: "Operations for a service", Params: []Param{
					{Name: "service", Required: true, Description: "Service name"},
				}},
			},
		},
		{
			Title: "Analytics",
			Endpoints: []Endpoint{
				{Method: "GET", Path: "/api/dependencies", Summary: "Service-to-service call edges", Params: []Param{
					{Name: "window", Description: "Time window e.g. 1h, 15m"},
				}},
				{Method: "GET", Path: "/api/health/services", Summary: "Per-service RED metrics (p50/p95/p99, error rate)"},
				{Method: "GET", Path: "/api/hotspots", Summary: "Operations ranked by error count"},
				{Method: "GET", Path: "/api/facets", Summary: "Top tag values", Params: []Param{
					{Name: "tag", Required: true, Description: "Tag key to facet"},
				}},
				{Method: "GET", Path: "/api/metrics/red", Summary: "RED time series for a service"},
				{Method: "GET", Path: "/api/errors", Summary: "Grouped error fingerprints"},
				{Method: "GET", Path: "/api/flamegraph", Summary: "Aggregated self-time flame graph"},
			},
		},
		{
			Title: "Incident Intelligence",
			Endpoints: []Endpoint{
				{Method: "GET", Path: "/api/intelligence/overview", Summary: "System health summary and recent incidents"},
				{Method: "GET", Path: "/api/incidents", Summary: "List incidents", Params: []Param{
					{Name: "status", Description: "open | resolved"},
					{Name: "limit", Description: "Max results"},
				}},
				{Method: "GET", Path: "/api/incidents/{id}", Summary: "Incident detail"},
				{Method: "GET", Path: "/api/incidents/{id}/rca", Summary: "Root cause analysis"},
				{Method: "GET", Path: "/api/incidents/{id}/timeline", Summary: "Incident event timeline"},
				{Method: "GET", Path: "/api/incidents/{id}/blast-radius", Summary: "Blast radius and dependency edges"},
				{Method: "GET", Path: "/api/incidents/{id}/debug", Summary: "Full debug assistant context (playbook, evidence, hotspots, deployments)"},
				{Method: "POST", Path: "/api/incidents/{id}/resolve", Summary: "Mark incident resolved"},
				{Method: "POST", Path: "/api/deployments", Summary: "Record a deployment event"},
			},
		},
		{
			Title: "Alerts & Streaming",
			Endpoints: []Endpoint{
				{Method: "GET", Path: "/api/alerts", Summary: "List alert rules"},
				{Method: "POST", Path: "/api/alerts", Summary: "Create alert rule"},
				{Method: "PATCH", Path: "/api/alerts/{id}", Summary: "Update alert rule"},
				{Method: "DELETE", Path: "/api/alerts/{id}", Summary: "Delete alert rule"},
				{Method: "GET", Path: "/api/alerts/events", Summary: "Recent alert firings"},
				{Method: "GET", Path: "/api/alerts/channels", Summary: "Notification channels"},
				{Method: "GET", Path: "/api/live", Summary: "Live Tail SSE stream of ingested spans"},
			},
		},
	}
}

func uiRoutes() []UIRoute {
	return []UIRoute{
		{Path: "/", Title: "System Overview", Description: "Incident intelligence dashboard with service health, dependencies, and hotspots"},
		{Path: "/incidents", Title: "Incidents", Description: "Primary incident feed — auto-detected from telemetry"},
		{Path: "/incidents/{id}", Title: "Incident Detail", Description: "Summary, RCA, timeline preview, evidence traces, playbook"},
		{Path: "/incidents/{id}/rca", Title: "Root Cause", Description: "Hypothesis, dependency chain, evidence"},
		{Path: "/incidents/{id}/timeline", Title: "Timeline", Description: "Unified incident event reconstruction"},
		{Path: "/incidents/{id}/blast-radius", Title: "Blast Radius", Description: "Downstream propagation map"},
		{Path: "/incidents/{id}/debug", Title: "Debug Assistant", Description: "Interactive investigation checklist with deep links"},
		{Path: "/explore", Title: "Trace Explorer", Description: "Filter and search traces (evidence drill-down)"},
		{Path: "/traces/{id}", Title: "Trace Waterfall", Description: "Span tree with timing bars and critical path"},
		{Path: "/connect", Title: "Connect", Description: "OTLP setup guide and endpoint info"},
		{Path: "/alerts", Title: "Alerts", Description: "Threshold rules and firing feed"},
		{Path: "/docs", Title: "Documentation", Description: "This guide"},
	}
}

func envVars() []Param {
	return []Param{
		{Name: "DATABASE_URL", Description: "Postgres connection string"},
		{Name: "ROLE", Description: "all | ingest | query"},
		{Name: "DEMO_PROJECT", Description: "Demo project ID (default: demo)"},
		{Name: "AUTO_SEED_DEMO", Description: "Auto-seed demo traces on startup (true/false)"},
		{Name: "INGEST_KEYS", Description: "Comma-separated key:project pairs for multi-tenant ingest"},
		{Name: "CORS_ORIGIN", Description: "Allowed frontend origin"},
		{Name: "REDIS_URL", Description: "Optional Redis buffer for ingest/query split"},
		{Name: "SAMPLE_RATE", Description: "Head sampling rate 0.0–1.0"},
		{Name: "RETENTION_HOURS", Description: "Span retention window"},
		{Name: "RATE_LIMIT_RPM", Description: "Per-key ingest rate limit"},
		{Name: "PUBLIC_URL", Description: "Advertised ingest URL for Connect page"},
		{Name: "NEXT_PUBLIC_API_URL", Description: "Frontend: backend API base URL"},
	}
}

// HandlerJSON serves documentation as JSON.
func HandlerJSON(frontendURL, apiURL string) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json; charset=utf-8")
		_ = json.NewEncoder(w).Encode(Build(frontendURL, apiURL))
	}
}
