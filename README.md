# PathTrace

An OpenTelemetry-native **distributed tracing and service observability** platform.
Send your services' traces to PathTrace over OTLP and get trace search, a
waterfall timeline view, a live span stream, service-health scorecards, a
service dependency map, and threshold-based alerting.

- **Backend:** Go + Postgres (deploys to Render)
- **Frontend:** Next.js + TypeScript (deploys to Vercel)
- **Ingestion:** OpenTelemetry Protocol (OTLP/HTTP JSON)

> Full design and rationale: [implementation.md](implementation.md)

---

## What problem it solves

Modern apps are made of many small services calling each other. When a request
is slow or fails, the cause could be in any of them. PathTrace follows a single
request across **all** the services it touches and shows the full journey on one
timeline, so you can immediately see **which service was slow** and **where it
broke** instead of digging through scattered logs.

---

## Features

| Area | Feature |
|------|---------|
| Ingest | OTLP/HTTP + gRPC trace ingestion, per-project API keys, rate limiting, probabilistic head sampling |
| Demo | Public **demo** project auto-seeded on startup — no login required for interviewers |
| Search | Filter traces by service, operation, tag, duration, error status, time; **TraceQL** query DSL |
| Trace view | Enhanced waterfall (minimap, zoom, crosshair), span tree, span detail, **critical-path** highlighting, **trace diff** |
| Live Tail | Real-time span stream over Server-Sent Events |
| Monitor | **RED metrics** (rate, errors, duration) with latency percentile charts |
| Service Health | p50 / p95 / p99 latency, error rate, throughput per service |
| Errors | **Error groups** with fingerprinting, drill-in panel, sample trace links |
| Flame Graph | Aggregated self-time flame graph with click-to-zoom |
| Service Map | Interactive service-to-service dependency graph (click nodes → explore) |
| Facets | Tag value explorer with cross-links to trace search |
| Hotspots | Operations ranked by error count/rate |
| Alerts | SLO/threshold rules (incl. **SLO burn rate**), notification **channels**, firing/resolved feed, enable toggle |
| Saved views | Persist and restore explore filter presets |
| Connect | Copy-paste OTLP setup guide with endpoint + API key info |

---

## Screenshots

| Explore | Trace waterfall |
|---|---|
| ![Explore](docs/screenshots/explore.png) | ![Waterfall](docs/screenshots/waterfall.png) |

| Service health | Service map |
|---|---|
| ![Health](docs/screenshots/health.png) | ![Service map](docs/screenshots/servicemap.png) |

| Live tail | Alerts |
|---|---|
| ![Live tail](docs/screenshots/live.png) | ![Alerts](docs/screenshots/alerts.png) |

---

## Run it locally

You need **Go 1.26+** and **Node 20+**. No Docker or manual Postgres setup is
required — the backend boots an embedded Postgres for local development.

### 1. Backend (API + embedded Postgres)

```bash
cd backend
go run ./cmd/server
```

The server listens on `http://localhost:8080`. On first run it downloads and
starts a local Postgres automatically (data is stored under `backend/.pt-data`).

### 2. Seed demo traces

In a second terminal:

```bash
cd backend
go run ./cmd/tracegen -count 300
```

This simulates an e-commerce system (`api-gateway → checkout → payments /
inventory → …`) so every screen has realistic data.

### 3. Frontend

In a third terminal:

```bash
cd frontend
npm install
npm run dev
```

Open `http://localhost:3000`. The **demo** project is selected by default and
auto-populated on first backend start (`AUTO_SEED_DEMO=true`).

### 4. (Optional) Run the OTel demo microservices

Three services send real OpenTelemetry traces to PathTrace:

```bash
cd demo/otel-demo
go run ./cmd/catalog    # :8091
go run ./cmd/orders     # :8092
go run ./cmd/storefront # :8090 — auto-generates traffic
```

See [demo/otel-demo/README.md](demo/otel-demo/README.md).

### 5. (Optional) Run the maintenance job

Evaluates alert rules and prunes old spans. It needs the same database:

```bash
cd backend
# Windows PowerShell
$env:DATABASE_URL="postgres://pathtrace:pathtrace@localhost:55432/pathtrace?sslmode=disable"; go run ./cmd/cron
# macOS/Linux
DATABASE_URL="postgres://pathtrace:pathtrace@localhost:55432/pathtrace?sslmode=disable" go run ./cmd/cron
```

---

## Deploy

- **Backend → Render:** the [`render.yaml`](render.yaml) blueprint provisions the
  Go web service, a free Postgres, and the cron job.
- **Frontend → Vercel:** deploy the `frontend/` directory and set
  `NEXT_PUBLIC_API_URL` to your Render API URL. Set `CORS_ORIGIN` on the Render
  service to your Vercel URL.

See [implementation.md](implementation.md) for the full deployment guide and
free-tier notes.

---

## Project layout

```
pathtrace/
├── backend/            Go: ingest, query API, analytics, live tail, alerts
│   ├── cmd/
│   │   ├── server/     all-in-one API (default)
│   │   ├── collector/  ingest-only role
│   │   ├── query/      query + Redis worker role
│   │   ├── cron/       retention sweep + alert evaluation
│   │   └── tracegen/   demo trace generator
│   └── internal/       ingest, sampling, storage, analytics, alerts, query
├── demo/otel-demo/     3-service OpenTelemetry demo app
├── frontend/           Next.js observability UI
├── .github/workflows/  CI (Go build/test, frontend tsc + build)
├── render.yaml         Render deployment blueprint
└── implementation.md   architecture, API spec, schema, roadmap
```
