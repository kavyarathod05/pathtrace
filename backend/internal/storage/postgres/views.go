package postgres

import (
	"context"
	"encoding/json"

	"github.com/pathtrace/pathtrace/internal/model"
)

// ListSavedViews returns saved views for a project.
func (s *Store) ListSavedViews(ctx context.Context, project string) ([]model.SavedView, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, project_id, name, kind, params, created_at
		FROM saved_views WHERE project_id=$1 ORDER BY created_at DESC`,
		orDefault(project))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.SavedView{}
	for rows.Next() {
		var v model.SavedView
		var params []byte
		if err := rows.Scan(&v.ID, &v.ProjectID, &v.Name, &v.Kind, &params, &v.CreatedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(params, &v.Params)
		if v.Params == nil {
			v.Params = map[string]any{}
		}
		out = append(out, v)
	}
	return out, rows.Err()
}

// CreateSavedView inserts a saved view and returns its ID.
func (s *Store) CreateSavedView(ctx context.Context, v model.SavedView) (int64, error) {
	params, _ := json.Marshal(orEmptyMap(v.Params))
	if v.Kind == "" {
		v.Kind = "explore"
	}
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO saved_views (project_id, name, kind, params)
		VALUES ($1,$2,$3,$4) RETURNING id`,
		orDefault(v.ProjectID), v.Name, v.Kind, params,
	).Scan(&id)
	return id, err
}

// DeleteSavedView removes a saved view by ID.
func (s *Store) DeleteSavedView(ctx context.Context, project string, id int64) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM saved_views WHERE project_id=$1 AND id=$2`,
		orDefault(project), id)
	return err
}
