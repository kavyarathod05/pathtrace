package postgres

import (
	"context"

	"github.com/pathtrace/pathtrace/internal/model"
)

// ListAlertRules returns all alert rules for a project.
func (s *Store) ListAlertRules(ctx context.Context, project string) ([]model.AlertRule, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, project_id, name, COALESCE(service,''), metric, op, threshold, window_sec
		FROM alert_rules WHERE project_id=$1 ORDER BY id`,
		orDefault(project))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.AlertRule{}
	for rows.Next() {
		var r model.AlertRule
		if err := rows.Scan(&r.ID, &r.ProjectID, &r.Name, &r.Service, &r.Metric, &r.Op, &r.Threshold, &r.WindowSec); err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// CreateAlertRule inserts a new alert rule and returns its ID.
func (s *Store) CreateAlertRule(ctx context.Context, r model.AlertRule) (int64, error) {
	if r.WindowSec <= 0 {
		r.WindowSec = 300
	}
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO alert_rules (project_id, name, service, metric, op, threshold, window_sec)
		VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id`,
		orDefault(r.ProjectID), r.Name, nullIfEmpty(r.Service), r.Metric, r.Op, r.Threshold, r.WindowSec,
	).Scan(&id)
	return id, err
}

// DeleteAlertRule removes a rule by ID.
func (s *Store) DeleteAlertRule(ctx context.Context, project string, id int64) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM alert_rules WHERE project_id=$1 AND id=$2`,
		orDefault(project), id)
	return err
}

// RecordAlertEvent stores a firing of a rule.
func (s *Store) RecordAlertEvent(ctx context.Context, ruleID int64, value, threshold float64) error {
	_, err := s.pool.Exec(ctx,
		`INSERT INTO alert_events (rule_id, value, threshold) VALUES ($1,$2,$3)`,
		ruleID, value, threshold)
	return err
}

// RecentAlertEvents returns the most recent firings joined with rule metadata.
func (s *Store) RecentAlertEvents(ctx context.Context, project string, limit int) ([]model.AlertEvent, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT e.id, e.rule_id, r.name, COALESCE(r.service,''), r.metric, e.fired_at, e.value, e.threshold
		FROM alert_events e
		JOIN alert_rules r ON r.id = e.rule_id
		WHERE r.project_id = $1
		ORDER BY e.fired_at DESC
		LIMIT $2`,
		orDefault(project), limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.AlertEvent{}
	for rows.Next() {
		var ev model.AlertEvent
		if err := rows.Scan(&ev.ID, &ev.RuleID, &ev.RuleName, &ev.Service, &ev.Metric, &ev.FiredAt, &ev.Value, &ev.Threshold); err != nil {
			return nil, err
		}
		out = append(out, ev)
	}
	return out, rows.Err()
}
