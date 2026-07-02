// Package analytics computes derived observability data directly in Postgres:
// service dependency edges, per-service health percentiles, error hotspots,
// and tag facets. Everything is a single SQL query so it stays cheap on the
// free tier (no batch jobs, no separate metrics store).
package analytics

import (
	"context"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pathtrace/pathtrace/internal/model"
)

// Engine runs analytics queries against the span store.
type Engine struct {
	pool *pgxpool.Pool
}

// New creates an analytics engine over the given pool.
func New(pool *pgxpool.Pool) *Engine { return &Engine{pool: pool} }

// Dependencies computes service-to-service call edges within the lookback window
// using a self-join on parent/child spans.
func (e *Engine) Dependencies(ctx context.Context, project string, lookback time.Duration) ([]model.DependencyEdge, error) {
	since := time.Now().Add(-lookback)
	rows, err := e.pool.Query(ctx, `
		SELECT p.service_name AS parent,
		       c.service_name AS child,
		       count(*) AS call_count,
		       count(*) FILTER (WHERE c.status_code = 'ERROR') AS error_count
		FROM spans c
		JOIN spans p
		  ON c.parent_span_id = p.span_id
		 AND c.trace_id = p.trace_id
		 AND c.project_id = p.project_id
		WHERE c.project_id = $1
		  AND c.service_name <> p.service_name
		  AND c.start_time >= $2
		GROUP BY 1, 2
		ORDER BY call_count DESC`,
		orDefault(project), since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	edges := []model.DependencyEdge{}
	for rows.Next() {
		var ed model.DependencyEdge
		if err := rows.Scan(&ed.Parent, &ed.Child, &ed.CallCount, &ed.ErrorCount); err != nil {
			return nil, err
		}
		edges = append(edges, ed)
	}
	return edges, rows.Err()
}

// ServiceHealth returns latency percentiles, error rate and throughput per
// service over the window.
func (e *Engine) ServiceHealth(ctx context.Context, project string, window time.Duration) ([]model.ServiceHealth, error) {
	since := time.Now().Add(-window)
	minutes := window.Minutes()
	if minutes <= 0 {
		minutes = 1
	}
	rows, err := e.pool.Query(ctx, `
		SELECT service_name,
		       count(*) AS span_count,
		       count(*) FILTER (WHERE status_code = 'ERROR') AS error_count,
		       percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_us) AS p50,
		       percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_us) AS p95,
		       percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_us) AS p99
		FROM spans
		WHERE project_id = $1 AND start_time >= $2
		GROUP BY service_name
		ORDER BY span_count DESC`,
		orDefault(project), since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.ServiceHealth{}
	for rows.Next() {
		var h model.ServiceHealth
		if err := rows.Scan(&h.Service, &h.SpanCount, &h.ErrorCount, &h.P50US, &h.P95US, &h.P99US); err != nil {
			return nil, err
		}
		if h.SpanCount > 0 {
			h.ErrorRate = float64(h.ErrorCount) / float64(h.SpanCount)
		}
		h.ThroughputPerMin = float64(h.SpanCount) / minutes
		out = append(out, h)
	}
	return out, rows.Err()
}

// Hotspots ranks the operations with the most errors in the window.
func (e *Engine) Hotspots(ctx context.Context, project string, window time.Duration, limit int) ([]model.Hotspot, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	since := time.Now().Add(-window)
	rows, err := e.pool.Query(ctx, `
		SELECT service_name, operation_name,
		       count(*) FILTER (WHERE status_code = 'ERROR') AS error_count,
		       count(*) AS total_count
		FROM spans
		WHERE project_id = $1 AND start_time >= $2
		GROUP BY service_name, operation_name
		HAVING count(*) FILTER (WHERE status_code = 'ERROR') > 0
		ORDER BY error_count DESC
		LIMIT $3`,
		orDefault(project), since, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.Hotspot{}
	for rows.Next() {
		var h model.Hotspot
		if err := rows.Scan(&h.Service, &h.Operation, &h.ErrorCount, &h.TotalCount); err != nil {
			return nil, err
		}
		if h.TotalCount > 0 {
			h.ErrorRate = float64(h.ErrorCount) / float64(h.TotalCount)
		}
		out = append(out, h)
	}
	return out, rows.Err()
}

// Facets returns the most common values for a given tag key in the window.
func (e *Engine) Facets(ctx context.Context, project, tagKey string, window time.Duration, limit int) ([]model.FacetValue, error) {
	if limit <= 0 || limit > 100 {
		limit = 20
	}
	since := time.Now().Add(-window)
	rows, err := e.pool.Query(ctx, `
		SELECT tags ->> $2 AS value, count(*) AS cnt
		FROM spans
		WHERE project_id = $1 AND start_time >= $3 AND tags ? $2
		GROUP BY value
		ORDER BY cnt DESC
		LIMIT $4`,
		orDefault(project), tagKey, since, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.FacetValue{}
	for rows.Next() {
		var f model.FacetValue
		if err := rows.Scan(&f.Value, &f.Count); err != nil {
			return nil, err
		}
		out = append(out, f)
	}
	return out, rows.Err()
}

// MetricValue computes a single scalar metric for a service over a window,
// used by the alert evaluator. Supported metrics: p95_latency_us, error_rate.
func (e *Engine) MetricValue(ctx context.Context, project, service, metric string, window time.Duration) (float64, bool, error) {
	since := time.Now().Add(-window)
	var value float64
	var count int64
	switch metric {
	case "p95_latency_us":
		row := e.pool.QueryRow(ctx, `
			SELECT COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_us), 0), count(*)
			FROM spans
			WHERE project_id=$1 AND start_time>=$2
			  AND ($3 = '' OR service_name = $3)`,
			orDefault(project), since, service)
		if err := row.Scan(&value, &count); err != nil {
			return 0, false, err
		}
	case "error_rate":
		row := e.pool.QueryRow(ctx, `
			SELECT CASE WHEN count(*) = 0 THEN 0
			            ELSE count(*) FILTER (WHERE status_code='ERROR')::float / count(*) END,
			       count(*)
			FROM spans
			WHERE project_id=$1 AND start_time>=$2
			  AND ($3 = '' OR service_name = $3)`,
			orDefault(project), since, service)
		if err := row.Scan(&value, &count); err != nil {
			return 0, false, err
		}
	default:
		return 0, false, nil
	}
	return value, count > 0, nil
}

func orDefault(project string) string {
	if project == "" {
		return "default"
	}
	return project
}
