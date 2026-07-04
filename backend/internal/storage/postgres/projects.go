package postgres

import (
	"context"
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

// HasSearchableTags reports whether a project has spans with attribute tags stored.
func (s *Store) HasSearchableTags(ctx context.Context, project string) (bool, error) {
	var n int64
	err := s.pool.QueryRow(ctx,
		`SELECT count(*) FROM spans WHERE project_id=$1 AND tags <> '{}'::jsonb`,
		orDefault(project)).Scan(&n)
	return n > 0, err
}
