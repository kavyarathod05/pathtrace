# PathTrace OTel Demo

Three microservices instrumented with the **OpenTelemetry Go SDK** that send
real OTLP traces to a local PathTrace backend.

| Service | Port | Role |
|---------|------|------|
| `storefront` | 8090 | Public API — product lookup + checkout |
| `catalog` | 8091 | Product catalog |
| `orders` | 8092 | Order creation (calls catalog, simulates payment) |

Call chain: `storefront → orders → catalog`

## Prerequisites

- PathTrace backend running at `http://localhost:8080`
- Go 1.22+

## Run locally

Open four terminals:

```bash
# 1 — PathTrace backend (from repo root)
cd backend && go run ./cmd/server

# 2 — catalog
cd demo/otel-demo && go run ./cmd/catalog

# 3 — orders
cd demo/otel-demo && go run ./cmd/orders

# 4 — storefront (auto-generates demo traffic)
cd demo/otel-demo && go run ./cmd/storefront
```

Open the UI at `http://localhost:3000/explore` (project **demo**) and watch
traces appear in **Live Tail**.

## Environment

| Variable | Default | Description |
|----------|---------|-------------|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `localhost:4317` | PathTrace gRPC OTLP endpoint |
| `OTEL_EXPORTER_OTLP_PROTOCOL` | `grpc` | Use gRPC (protobuf); HTTP ingest expects JSON |
| `PATHTRACE_KEY` | _(empty)_ | Optional `x-pathtrace-key` for multi-tenant ingest |
| `CATALOG_URL` | `http://localhost:8091` | Used by orders + storefront |
| `ORDERS_URL` | `http://localhost:8092` | Used by storefront |
| `GENERATE_TRAFFIC` | `true` | Background requests from storefront |

## Manual requests

```bash
curl -s localhost:8090/api/products/sku-101 | jq .
curl -s -XPOST localhost:8090/api/checkout \
  -H 'content-type: application/json' \
  -d '{"productId":"sku-101","qty":1}'
```
