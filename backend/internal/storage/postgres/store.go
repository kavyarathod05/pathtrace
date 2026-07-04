// Package postgres implements the PathTrace storage layer on top of Postgres.
// The same code path serves an embedded Postgres for local development and a
// managed Render Postgres in production; only the connection string differs.
package postgres

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pathtrace/pathtrace/internal/model"
)

//go:embed schema.sql
var schemaSQL string

// Store is the Postgres-backed data access layer.
type Store struct {
	pool *pgxpool.Pool
}

// New opens a connection pool and applies the schema (idempotent migrations).
func New(ctx context.Context, dsn string) (*Store, error) {
	cfg, err := pgxpool.ParseConfig(dsn)
	if err != nil {
		return nil, fmt.Errorf("parse dsn: %w", err)
	}
	// Keep the pool small: Render free Postgres has a low connection limit.
	cfg.MaxConns = 8
	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("connect: %w", err)
	}
	s := &Store{pool: pool}
	if err := s.migrate(ctx); err != nil {
		pool.Close()
		return nil, err
	}
	return s, nil
}

func (s *Store) migrate(ctx context.Context) error {
	if _, err := s.pool.Exec(ctx, schemaSQL); err != nil {
		return fmt.Errorf("migrate: %w", err)
	}
	return nil
}

// Close releases the connection pool.
func (s *Store) Close() { s.pool.Close() }

// Pool exposes the underlying pool for advanced callers (analytics, cron).
func (s *Store) Pool() *pgxpool.Pool { return s.pool }

// InsertSpans bulk-inserts a batch of spans using COPY-style batching.
func (s *Store) InsertSpans(ctx context.Context, spans []model.Span) error {
	if len(spans) == 0 {
		return nil
	}
	batch := &pgx.Batch{}
	for _, sp := range spans {
		tags, _ := json.Marshal(orEmptyMap(sp.Tags))
		events, _ := json.Marshal(orEmptySlice[model.SpanEvent](sp.Events))
		refs, _ := json.Marshal(orEmptySlice[model.SpanRef](sp.Refs))
		batch.Queue(`
			INSERT INTO spans (
				project_id, trace_id, span_id, parent_span_id, service_name,
				operation_name, kind, start_time, duration_us, status_code,
				status_message, tags, events, refs
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
			ON CONFLICT (project_id, trace_id, span_id) DO NOTHING`,
			orDefault(sp.ProjectID), sp.TraceID, sp.SpanID, nullIfEmpty(sp.ParentSpanID),
			sp.ServiceName, sp.OperationName, nullIfEmpty(sp.Kind), sp.StartTime,
			sp.DurationUS, nullIfEmpty(sp.StatusCode), nullIfEmpty(sp.StatusMessage),
			tags, events, refs,
		)
	}
	br := s.pool.SendBatch(ctx, batch)
	defer br.Close()
	for range spans {
		if _, err := br.Exec(); err != nil {
			return fmt.Errorf("insert span: %w", err)
		}
	}
	return nil
}

// Services returns the distinct service names for a project.
func (s *Store) Services(ctx context.Context, project string) ([]string, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT DISTINCT service_name FROM spans WHERE project_id=$1 ORDER BY service_name`,
		orDefault(project))
	if err != nil {
		return nil, err
	}
	return scanStrings(rows)
}

// Operations returns the distinct operation names for a service.
func (s *Store) Operations(ctx context.Context, project, service string) ([]string, error) {
	rows, err := s.pool.Query(ctx,
		`SELECT DISTINCT operation_name FROM spans
		 WHERE project_id=$1 AND service_name=$2 ORDER BY operation_name`,
		orDefault(project), service)
	if err != nil {
		return nil, err
	}
	return scanStrings(rows)
}

// FindTraceIDs applies the search filters and returns matching trace IDs,
// ordered by most recent, capped at the query limit.
//
// Filters use trace-level semantics: service/operation/duration/error must match
// on the same span within a trace, while tags and time windows can be satisfied
// by any span in that trace. This matches how distributed traces are explored
// in practice (e.g. service=payments plus tag on the gateway span).
func (s *Store) FindTraceIDs(ctx context.Context, q model.TraceQuery) ([]string, error) {
	project := orDefault(q.ProjectID)
	limit := q.Limit
	if limit <= 0 || limit > 200 {
		limit = 20
	}

	args := []any{project}
	placeholder := func(v any) string {
		args = append(args, v)
		return fmt.Sprintf("$%d", len(args))
	}

	var traceFilters []string

	var scopeConds []string
	if q.Service != "" {
		scopeConds = append(scopeConds, fmt.Sprintf("service_name = %s", placeholder(q.Service)))
	}
	if q.Operation != "" {
		scopeConds = append(scopeConds, fmt.Sprintf("operation_name = %s", placeholder(q.Operation)))
	}
	if q.MinDuration > 0 {
		scopeConds = append(scopeConds, fmt.Sprintf("duration_us >= %s", placeholder(q.MinDuration)))
	}
	if q.MaxDuration > 0 {
		scopeConds = append(scopeConds, fmt.Sprintf("duration_us <= %s", placeholder(q.MaxDuration)))
	}
	if q.OnlyErrors {
		scopeConds = append(scopeConds, "status_code = 'ERROR'")
	}
	if len(scopeConds) > 0 {
		traceFilters = append(traceFilters, fmt.Sprintf(
			"trace_id IN (SELECT trace_id FROM spans WHERE project_id = $1 AND %s)",
			strings.Join(scopeConds, " AND "),
		))
	}

	for k, v := range q.Tags {
		tagJSON, _ := json.Marshal(map[string]string{k: v})
		ph := placeholder(string(tagJSON))
		traceFilters = append(traceFilters, fmt.Sprintf(
			"trace_id IN (SELECT trace_id FROM spans WHERE project_id = $1 AND tags @> %s::jsonb)",
			ph,
		))
	}

	var timeConds []string
	if !q.Start.IsZero() {
		timeConds = append(timeConds, fmt.Sprintf("start_time >= %s", placeholder(q.Start)))
	}
	if !q.End.IsZero() {
		timeConds = append(timeConds, fmt.Sprintf("start_time <= %s", placeholder(q.End)))
	}
	if len(timeConds) > 0 {
		traceFilters = append(traceFilters, fmt.Sprintf(
			"trace_id IN (SELECT trace_id FROM spans WHERE project_id = $1 AND %s)",
			strings.Join(timeConds, " AND "),
		))
	}

	where := "WHERE project_id = $1"
	if len(traceFilters) > 0 {
		where += " AND " + strings.Join(traceFilters, " AND ")
	}

	query := fmt.Sprintf(`
		SELECT trace_id, MAX(start_time) AS ts
		FROM spans
		%s
		GROUP BY trace_id
		ORDER BY ts DESC
		LIMIT %d`, where, limit)

	rows, err := s.pool.Query(ctx, query, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var ids []string
	for rows.Next() {
		var id string
		var ts time.Time
		if err := rows.Scan(&id, &ts); err != nil {
			return nil, err
		}
		ids = append(ids, id)
	}
	return ids, rows.Err()
}

// GetTraces loads all spans for the given trace IDs and groups them into traces.
func (s *Store) GetTraces(ctx context.Context, project string, traceIDs []string) ([]model.Trace, error) {
	if len(traceIDs) == 0 {
		return nil, nil
	}
	rows, err := s.pool.Query(ctx, `
		SELECT trace_id, span_id, parent_span_id, service_name, operation_name,
		       kind, start_time, duration_us, status_code, status_message,
		       tags, events, refs
		FROM spans
		WHERE project_id=$1 AND trace_id = ANY($2)
		ORDER BY start_time ASC`,
		orDefault(project), traceIDs)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	byTrace := map[string][]model.Span{}
	order := []string{}
	for rows.Next() {
		sp, err := scanSpan(rows)
		if err != nil {
			return nil, err
		}
		if _, ok := byTrace[sp.TraceID]; !ok {
			order = append(order, sp.TraceID)
		}
		byTrace[sp.TraceID] = append(byTrace[sp.TraceID], sp)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	traces := make([]model.Trace, 0, len(order))
	for _, id := range order {
		spans := byTrace[id]
		traces = append(traces, model.Trace{
			TraceID: id,
			Spans:   spans,
			Summary: summarize(id, spans),
		})
	}
	return traces, nil
}

// GetTrace returns a single trace by ID.
func (s *Store) GetTrace(ctx context.Context, project, traceID string) (*model.Trace, error) {
	traces, err := s.GetTraces(ctx, project, []string{traceID})
	if err != nil {
		return nil, err
	}
	if len(traces) == 0 {
		return nil, nil
	}
	return &traces[0], nil
}

// DeleteOlderThan removes spans older than the cutoff (retention sweep).
func (s *Store) DeleteOlderThan(ctx context.Context, cutoff time.Time) (int64, error) {
	tag, err := s.pool.Exec(ctx, `DELETE FROM spans WHERE start_time < $1`, cutoff)
	if err != nil {
		return 0, err
	}
	return tag.RowsAffected(), nil
}

func scanSpan(rows pgx.Rows) (model.Span, error) {
	var sp model.Span
	var parent, kind, statusCode, statusMsg *string
	var tags, events, refs []byte
	if err := rows.Scan(
		&sp.TraceID, &sp.SpanID, &parent, &sp.ServiceName, &sp.OperationName,
		&kind, &sp.StartTime, &sp.DurationUS, &statusCode, &statusMsg,
		&tags, &events, &refs,
	); err != nil {
		return sp, err
	}
	return finishSpan(&sp, parent, kind, statusCode, statusMsg, tags, events, refs), nil
}

func scanSpanProject(rows pgx.Rows) (model.Span, error) {
	var sp model.Span
	var parent, kind, statusCode, statusMsg *string
	var tags, events, refs []byte
	if err := rows.Scan(
		&sp.ProjectID, &sp.TraceID, &sp.SpanID, &parent, &sp.ServiceName, &sp.OperationName,
		&kind, &sp.StartTime, &sp.DurationUS, &statusCode, &statusMsg,
		&tags, &events, &refs,
	); err != nil {
		return sp, err
	}
	return finishSpan(&sp, parent, kind, statusCode, statusMsg, tags, events, refs), nil
}

func finishSpan(sp *model.Span, parent, kind, statusCode, statusMsg *string, tags, events, refs []byte) model.Span {
	sp.ParentSpanID = deref(parent)
	sp.Kind = deref(kind)
	sp.StatusCode = deref(statusCode)
	sp.StatusMessage = deref(statusMsg)
	_ = json.Unmarshal(tags, &sp.Tags)
	_ = json.Unmarshal(events, &sp.Events)
	_ = json.Unmarshal(refs, &sp.Refs)
	if sp.Tags == nil {
		sp.Tags = map[string]any{}
	}
	return *sp
}

func summarize(traceID string, spans []model.Span) model.TraceSummary {
	sum := model.TraceSummary{TraceID: traceID, SpanCount: len(spans)}
	svcSet := map[string]struct{}{}
	var rootStart time.Time
	var rootEnd time.Time
	// Find the root span (no parent, or parent not present in this trace).
	ids := map[string]struct{}{}
	for _, sp := range spans {
		ids[sp.SpanID] = struct{}{}
	}
	for i, sp := range spans {
		svcSet[sp.ServiceName] = struct{}{}
		if sp.StatusCode == "ERROR" {
			sum.ErrorCount++
		}
		_, parentPresent := ids[sp.ParentSpanID]
		isRoot := sp.ParentSpanID == "" || !parentPresent
		if isRoot && (sum.RootService == "" || sp.StartTime.Before(rootStart) || i == 0 && rootStart.IsZero()) {
			if rootStart.IsZero() || sp.StartTime.Before(rootStart) {
				sum.RootService = sp.ServiceName
				sum.RootOperation = sp.OperationName
				rootStart = sp.StartTime
				rootEnd = sp.StartTime.Add(time.Duration(sp.DurationUS) * time.Microsecond)
			}
		}
	}
	if rootStart.IsZero() && len(spans) > 0 {
		rootStart = spans[0].StartTime
		rootEnd = spans[0].StartTime.Add(time.Duration(spans[0].DurationUS) * time.Microsecond)
		sum.RootService = spans[0].ServiceName
		sum.RootOperation = spans[0].OperationName
	}
	sum.StartTime = rootStart
	sum.DurationUS = rootEnd.Sub(rootStart).Microseconds()
	for svc := range svcSet {
		sum.Services = append(sum.Services, svc)
	}
	return sum
}
