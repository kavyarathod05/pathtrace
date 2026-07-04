package postgres

import (
	"context"
	"time"

	"github.com/pathtrace/pathtrace/internal/model"
)

// ListProjects returns distinct project IDs that have span data.
func (s *Store) ListProjects(ctx context.Context) ([]string, error) {
	rows, err := s.pool.Query(ctx, `SELECT DISTINCT project_id FROM spans ORDER BY project_id`)
	if err != nil {
		return nil, err
	}
	return scanStrings(rows)
}

// SpanCount returns the number of spans for a project.
func (s *Store) SpanCount(ctx context.Context, project string) (int64, error) {
	var n int64
	err := s.pool.QueryRow(ctx, `SELECT count(*) FROM spans WHERE project_id=$1`, orDefault(project)).Scan(&n)
	return n, err
}

// RecentSpanCount returns spans ingested since the given time.
func (s *Store) RecentSpanCount(ctx context.Context, project string, since time.Time) (int64, error) {
	var n int64
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM spans WHERE project_id=$1 AND start_time >= $2`,
		orDefault(project), since).Scan(&n)
	return n, err
}

// HasSearchableTags reports whether a project has spans with attribute tags stored.
func (s *Store) HasSearchableTags(ctx context.Context, project string) (bool, error) {
	var n int64
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM spans WHERE project_id=$1 AND tags <> '{}'::jsonb`,
		orDefault(project)).Scan(&n)
	return n > 0, err
}

// RecentTraceSpans returns spans from the most recent traces for live-tail replay.
func (s *Store) RecentTraceSpans(ctx context.Context, project string, traceLimit, spansPerTrace int) ([]model.Span, error) {
	if traceLimit <= 0 {
		traceLimit = 20
	}
	if spansPerTrace <= 0 {
		spansPerTrace = 10
	}
	rows, err := s.pool.Query(ctx, `
		WITH recent AS (
			SELECT trace_id, MAX(start_time) AS ts
			FROM spans
			WHERE project_id = $1
			GROUP BY trace_id
			ORDER BY ts DESC
			LIMIT $2
		)
		SELECT s.project_id, s.trace_id, s.span_id, s.parent_span_id, s.service_name, s.operation_name,
		       s.kind, s.start_time, s.duration_us, s.status_code, s.status_message,
		       s.tags, s.events, s.refs
		FROM spans s
		JOIN recent r ON r.trace_id = s.trace_id
		WHERE s.project_id = $1
		ORDER BY s.start_time ASC`,
		orDefault(project), traceLimit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var out []model.Span
	for rows.Next() {
		sp, err := scanSpanProject(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, sp)
		if len(out) >= traceLimit*spansPerTrace {
			break
		}
	}
	return out, rows.Err()
}
