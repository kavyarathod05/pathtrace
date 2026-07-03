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
	case "slo_burn_rate":
		// Error budget burn: actual error rate / (1 - slo_target)
		var errRate float64
		row := e.pool.QueryRow(ctx, `
			SELECT CASE WHEN count(*) = 0 THEN 0
			            ELSE count(*) FILTER (WHERE status_code='ERROR')::float / count(*) END,
			       count(*)
			FROM spans
			WHERE project_id=$1 AND start_time>=$2
			  AND ($3 = '' OR service_name = $3)`,
			orDefault(project), since, service)
		if err := row.Scan(&errRate, &count); err != nil {
			return 0, false, err
		}
		value = errRate // evaluator compares against threshold directly
	default:
		return 0, false, nil
	}
	return value, count > 0, nil
}

// RED returns time-bucketed rate/errors/duration metrics.
func (e *Engine) RED(ctx context.Context, project, service, operation string, window, step time.Duration) (model.REDSeries, error) {
	if step <= 0 {
		step = time.Minute
	}
	since := time.Now().Add(-window)
	origin := since.Truncate(step)
	stepSec := int(step.Seconds())
	if stepSec < 1 {
		stepSec = 60
	}

	rows, err := e.pool.Query(ctx, `
		SELECT date_bin(make_interval(secs => $3), start_time, $4::timestamptz) AS bucket,
		       count(*) AS cnt,
		       count(*) FILTER (WHERE status_code = 'ERROR') AS err_cnt,
		       COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_us), 0) AS p50,
		       COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_us), 0) AS p95,
		       COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_us), 0) AS p99
		FROM spans
		WHERE project_id = $1 AND start_time >= $2
		  AND ($5 = '' OR service_name = $5)
		  AND ($6 = '' OR operation_name = $6)
		GROUP BY bucket
		ORDER BY bucket`,
		orDefault(project), since, stepSec, origin, service, operation)
	if err != nil {
		return model.REDSeries{}, err
	}
	defer rows.Close()

	series := model.REDSeries{Service: service, Operation: operation, Step: step.String()}
	for rows.Next() {
		var p model.TimeSeriesPoint
		if err := rows.Scan(&p.Time, &p.Count, &p.ErrorCount, &p.P50US, &p.P95US, &p.P99US); err != nil {
			return series, err
		}
		series.Points = append(series.Points, p)
	}
	return series, rows.Err()
}

// ErrorGroups aggregates error spans into issues.
func (e *Engine) ErrorGroups(ctx context.Context, project string, window time.Duration, limit int) ([]model.ErrorGroup, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	since := time.Now().Add(-window)
	rows, err := e.pool.Query(ctx, `
		SELECT
		  md5(service_name || '|' || operation_name || '|' || COALESCE(tags->>'exception.type', status_message, '')) AS fp,
		  service_name,
		  operation_name,
		  COALESCE(tags->>'exception.type', 'Error') AS err_type,
		  COALESCE(status_message, '') AS msg,
		  count(*) AS cnt,
		  min(start_time) AS first_seen,
		  max(start_time) AS last_seen,
		  (array_agg(DISTINCT trace_id ORDER BY trace_id))[1:5] AS samples
		FROM spans
		WHERE project_id = $1 AND start_time >= $2 AND status_code = 'ERROR'
		GROUP BY 1, 2, 3, 4, 5
		ORDER BY cnt DESC
		LIMIT $3`,
		orDefault(project), since, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.ErrorGroup{}
	for rows.Next() {
		var g model.ErrorGroup
		if err := rows.Scan(&g.Fingerprint, &g.Service, &g.Operation, &g.ErrorType, &g.Message, &g.Count, &g.FirstSeen, &g.LastSeen, &g.SampleTraces); err != nil {
			return nil, err
		}
		out = append(out, g)
	}
	return out, rows.Err()
}

// ErrorGroupDetail returns occurrences for one fingerprint.
func (e *Engine) ErrorGroupDetail(ctx context.Context, project, fingerprint string, window time.Duration, limit int) (*model.ErrorGroup, error) {
	if limit <= 0 || limit > 50 {
		limit = 20
	}
	since := time.Now().Add(-window)
	var g model.ErrorGroup
	err := e.pool.QueryRow(ctx, `
		SELECT
		  md5(service_name || '|' || operation_name || '|' || COALESCE(tags->>'exception.type', status_message, '')),
		  service_name, operation_name,
		  COALESCE(tags->>'exception.type', 'Error'),
		  COALESCE(status_message, ''),
		  count(*), min(start_time), max(start_time),
		  (array_agg(DISTINCT trace_id ORDER BY trace_id))[1:$4]
		FROM spans
		WHERE project_id = $1 AND start_time >= $2 AND status_code = 'ERROR'
		  AND md5(service_name || '|' || operation_name || '|' || COALESCE(tags->>'exception.type', status_message, '')) = $3
		GROUP BY service_name, operation_name, tags->>'exception.type', status_message`,
		orDefault(project), since, fingerprint, limit,
	).Scan(&g.Fingerprint, &g.Service, &g.Operation, &g.ErrorType, &g.Message, &g.Count, &g.FirstSeen, &g.LastSeen, &g.SampleTraces)
	if err != nil {
		return nil, err
	}
	return &g, nil
}

// FlameGraph merges recent traces into a weighted call tree.
func (e *Engine) FlameGraph(ctx context.Context, project, service, operation string, window time.Duration, limit int) (model.FlameNode, error) {
	if limit <= 0 || limit > 100 {
		limit = 30
	}
	since := time.Now().Add(-window)
	rows, err := e.pool.Query(ctx, `
		SELECT DISTINCT trace_id FROM spans
		WHERE project_id = $1 AND start_time >= $2
		  AND ($3 = '' OR service_name = $3)
		  AND ($4 = '' OR operation_name = $4)
		ORDER BY trace_id DESC LIMIT $5`,
		orDefault(project), since, service, operation, limit)
	if err != nil {
		return model.FlameNode{}, err
	}
	defer rows.Close()
	var traceIDs []string
	for rows.Next() {
		var id string
		if err := rows.Scan(&id); err != nil {
			return model.FlameNode{}, err
		}
		traceIDs = append(traceIDs, id)
	}
	if len(traceIDs) == 0 {
		return model.FlameNode{Name: "root"}, nil
	}

	spanRows, err := e.pool.Query(ctx, `
		SELECT span_id, parent_span_id, service_name, operation_name, duration_us
		FROM spans WHERE project_id = $1 AND trace_id = ANY($2)`,
		orDefault(project), traceIDs)
	if err != nil {
		return model.FlameNode{}, err
	}
	defer spanRows.Close()

	var spans []flameSpan
	for spanRows.Next() {
		var s flameSpan
		var parent *string
		if err := spanRows.Scan(&s.id, &parent, &s.service, &s.op, &s.dur); err != nil {
			return model.FlameNode{}, err
		}
		if parent != nil {
			s.parent = *parent
		}
		spans = append(spans, s)
	}

	root := aggregateFlame(spans)
	return root, spanRows.Err()
}

type flameSpan struct {
	id, parent, service, op string
	dur                       int64
}

func aggregateFlame(spans []flameSpan) model.FlameNode {
	byID := map[string]flameSpan{}
	children := map[string][]string{}
	for _, s := range spans {
		byID[s.id] = s
		pid := s.parent
		if pid == "" || !containsChild(byID, pid) {
			pid = "__root__"
		}
		children[pid] = append(children[pid], s.id)
	}

	var build func(parentID string) model.FlameNode
	build = func(parentID string) model.FlameNode {
		node := model.FlameNode{Name: "root", Service: ""}
		if parentID != "__root__" {
			s := byID[parentID]
			node = model.FlameNode{Name: s.op, Service: s.service, TotalUS: s.dur, SelfUS: s.dur, Count: 1}
		}
		childTotal := int64(0)
		for _, cid := range children[parentID] {
			child := build(cid)
			node.Children = append(node.Children, child)
			childTotal += child.TotalUS
			node.Count += child.Count
		}
		if parentID != "__root__" {
			node.TotalUS = byID[parentID].dur
			if childTotal < node.TotalUS {
				node.SelfUS = node.TotalUS - childTotal
			}
		} else {
			for _, c := range node.Children {
				node.TotalUS += c.TotalUS
				node.Count += c.Count
			}
		}
		return node
	}
	return build("__root__")
}

func containsChild(byID map[string]flameSpan, pid string) bool {
	_, ok := byID[pid]
	return ok
}

func orDefault(project string) string {
	if project == "" {
		return "default"
	}
	return project
}
