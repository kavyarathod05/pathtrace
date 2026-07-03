package postgres

import (
	"context"
	"time"

	"github.com/pathtrace/pathtrace/internal/model"
)

const alertRuleCols = `id, project_id, name, COALESCE(service,''), metric, op, threshold, window_sec,
	enabled, COALESCE(severity,'warning'), for_sec, cooldown_sec, channel_id, COALESCE(slo_target,0), COALESCE(slo_window_sec,0)`

func scanAlertRule(row interface {
	Scan(dest ...any) error
}) (model.AlertRule, error) {
	var r model.AlertRule
	var channelID *int64
	if err := row.Scan(
		&r.ID, &r.ProjectID, &r.Name, &r.Service, &r.Metric, &r.Op, &r.Threshold, &r.WindowSec,
		&r.Enabled, &r.Severity, &r.ForSec, &r.CooldownSec, &channelID, &r.SLOTarget, &r.SLOWindowSec,
	); err != nil {
		return r, err
	}
	r.ChannelID = channelID
	return r, nil
}

// ListAlertRules returns all alert rules for a project.
func (s *Store) ListAlertRules(ctx context.Context, project string) ([]model.AlertRule, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT `+alertRuleCols+`
		FROM alert_rules WHERE project_id=$1 ORDER BY id`,
		orDefault(project))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.AlertRule{}
	for rows.Next() {
		r, err := scanAlertRule(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, r)
	}
	return out, rows.Err()
}

// GetAlertRule loads a single rule.
func (s *Store) GetAlertRule(ctx context.Context, project string, id int64) (*model.AlertRule, error) {
	r, err := scanAlertRule(s.pool.QueryRow(ctx, `
		SELECT `+alertRuleCols+`
		FROM alert_rules WHERE project_id=$1 AND id=$2`,
		orDefault(project), id))
	if err != nil {
		return nil, err
	}
	return &r, nil
}

// CreateAlertRule inserts a new alert rule and returns its ID.
func (s *Store) CreateAlertRule(ctx context.Context, r model.AlertRule) (int64, error) {
	if r.WindowSec <= 0 {
		r.WindowSec = 300
	}
	if r.Severity == "" {
		r.Severity = "warning"
	}
	if r.CooldownSec <= 0 {
		r.CooldownSec = 300
	}
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO alert_rules (
			project_id, name, service, metric, op, threshold, window_sec,
			enabled, severity, for_sec, cooldown_sec, channel_id, slo_target, slo_window_sec
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) RETURNING id`,
		orDefault(r.ProjectID), r.Name, nullIfEmpty(r.Service), r.Metric, r.Op, r.Threshold, r.WindowSec,
		r.Enabled, r.Severity, r.ForSec, r.CooldownSec, r.ChannelID, nullIfZero(r.SLOTarget), nullIfZeroInt(r.SLOWindowSec),
	).Scan(&id)
	return id, err
}

// UpdateAlertRule patches an existing rule.
func (s *Store) UpdateAlertRule(ctx context.Context, r model.AlertRule) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE alert_rules SET
			name=$3, service=$4, metric=$5, op=$6, threshold=$7, window_sec=$8,
			enabled=$9, severity=$10, for_sec=$11, cooldown_sec=$12,
			channel_id=$13, slo_target=$14, slo_window_sec=$15
		WHERE project_id=$1 AND id=$2`,
		orDefault(r.ProjectID), r.ID, r.Name, nullIfEmpty(r.Service), r.Metric, r.Op, r.Threshold, r.WindowSec,
		r.Enabled, r.Severity, r.ForSec, r.CooldownSec, r.ChannelID, nullIfZero(r.SLOTarget), nullIfZeroInt(r.SLOWindowSec),
	)
	return err
}

// DeleteAlertRule removes a rule by ID.
func (s *Store) DeleteAlertRule(ctx context.Context, project string, id int64) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM alert_rules WHERE project_id=$1 AND id=$2`,
		orDefault(project), id)
	return err
}

// RecordAlertEvent stores a firing or resolution of a rule.
func (s *Store) RecordAlertEvent(ctx context.Context, ruleID int64, value, threshold float64, state, severity string) error {
	if state == "" {
		state = "firing"
	}
	if severity == "" {
		severity = "warning"
	}
	_, err := s.pool.Exec(ctx,
		`INSERT INTO alert_events (rule_id, value, threshold, state, severity) VALUES ($1,$2,$3,$4,$5)`,
		ruleID, value, threshold, state, severity)
	return err
}

// RecentAlertEvents returns the most recent firings joined with rule metadata.
func (s *Store) RecentAlertEvents(ctx context.Context, project string, limit int) ([]model.AlertEvent, error) {
	if limit <= 0 || limit > 200 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT e.id, e.rule_id, r.name, COALESCE(r.service,''), r.metric, e.fired_at, e.value, e.threshold,
		       COALESCE(e.state,'firing'), COALESCE(e.severity,'warning')
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
		if err := rows.Scan(&ev.ID, &ev.RuleID, &ev.RuleName, &ev.Service, &ev.Metric, &ev.FiredAt, &ev.Value, &ev.Threshold, &ev.State, &ev.Severity); err != nil {
			return nil, err
		}
		out = append(out, ev)
	}
	return out, rows.Err()
}

// GetAlertState returns the current state for a rule (ok if none).
func (s *Store) GetAlertState(ctx context.Context, ruleID int64) (model.AlertState, error) {
	var st model.AlertState
	var lastNotified *time.Time
	err := s.pool.QueryRow(ctx, `
		SELECT rule_id, state, since, last_notified FROM alert_state WHERE rule_id=$1`, ruleID,
	).Scan(&st.RuleID, &st.State, &st.Since, &lastNotified)
	if err != nil {
		return model.AlertState{RuleID: ruleID, State: "ok", Since: time.Now()}, nil
	}
	st.LastNotified = lastNotified
	return st, nil
}

// UpsertAlertState writes the current lifecycle state.
func (s *Store) UpsertAlertState(ctx context.Context, st model.AlertState) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO alert_state (rule_id, state, since, last_notified)
		VALUES ($1,$2,$3,$4)
		ON CONFLICT (rule_id) DO UPDATE SET state=$2, since=$3, last_notified=$4`,
		st.RuleID, st.State, st.Since, st.LastNotified)
	return err
}

func nullIfZero(f float64) any {
	if f == 0 {
		return nil
	}
	return f
}

func nullIfZeroInt(n int) any {
	if n == 0 {
		return nil
	}
	return n
}
