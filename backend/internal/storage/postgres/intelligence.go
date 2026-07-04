package postgres

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"

	"github.com/pathtrace/pathtrace/internal/model"
)

func (s *Store) UpsertService(ctx context.Context, project, name string, lastSeen time.Time) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO services (project_id, name, last_seen)
		VALUES ($1, $2, $3)
		ON CONFLICT (project_id, name) DO UPDATE SET last_seen = EXCLUDED.last_seen`,
		orDefault(project), name, lastSeen)
	return err
}

func (s *Store) RebuildServiceEdges(ctx context.Context, project string, since time.Time) error {
	_, err := s.pool.Exec(ctx, `
		DELETE FROM service_edges WHERE project_id = $1;
		INSERT INTO service_edges (project_id, parent, child, call_count, error_count, p95_us, updated_at)
		SELECT c.project_id,
		       p.service_name AS parent,
		       c.service_name AS child,
		       count(*) AS call_count,
		       count(*) FILTER (WHERE c.status_code = 'ERROR') AS error_count,
		       COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY c.duration_us), 0)::bigint AS p95_us,
		       now()
		FROM spans c
		JOIN spans p
		  ON c.parent_span_id = p.span_id
		 AND c.trace_id = p.trace_id
		 AND c.project_id = p.project_id
		WHERE c.project_id = $1
		  AND c.service_name <> p.service_name
		  AND c.start_time >= $2
		GROUP BY c.project_id, p.service_name, c.service_name`,
		orDefault(project), since)
	return err
}

func (s *Store) UpsertBaseline(ctx context.Context, b model.ServiceBaseline) error {
	_, err := s.pool.Exec(ctx, `
		INSERT INTO service_baselines (project_id, service, window_min, error_rate, p50_us, p95_us, p99_us, throughput, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now())
		ON CONFLICT (project_id, service, window_min) DO UPDATE SET
		  error_rate = EXCLUDED.error_rate,
		  p50_us = EXCLUDED.p50_us,
		  p95_us = EXCLUDED.p95_us,
		  p99_us = EXCLUDED.p99_us,
		  throughput = EXCLUDED.throughput,
		  updated_at = now()`,
		orDefault(b.ProjectID), b.Service, b.WindowMin, b.ErrorRate, b.P50US, b.P95US, b.P99US, b.Throughput)
	return err
}

func (s *Store) ListBaselines(ctx context.Context, project string, windowMin int) ([]model.ServiceBaseline, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT project_id, service, window_min, error_rate, p50_us, p95_us, p99_us, throughput, updated_at
		FROM service_baselines
		WHERE project_id = $1 AND window_min = $2`,
		orDefault(project), windowMin)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.ServiceBaseline
	for rows.Next() {
		var b model.ServiceBaseline
		if err := rows.Scan(&b.ProjectID, &b.Service, &b.WindowMin, &b.ErrorRate, &b.P50US, &b.P95US, &b.P99US, &b.Throughput, &b.UpdatedAt); err != nil {
			return nil, err
		}
		out = append(out, b)
	}
	return out, rows.Err()
}

func (s *Store) CreateDeployment(ctx context.Context, d model.Deployment) (int64, error) {
	meta, _ := json.Marshal(orEmptyMap(d.Metadata))
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO deployments (project_id, service, version, change_type, metadata, deployed_at)
		VALUES ($1,$2,$3,$4,$5,$6) RETURNING id`,
		orDefault(d.ProjectID), d.Service, nullIfEmpty(d.Version), d.ChangeType, meta, d.DeployedAt).Scan(&id)
	return id, err
}

func (s *Store) RecentDeployments(ctx context.Context, project string, since time.Time, limit int) ([]model.Deployment, error) {
	if limit <= 0 {
		limit = 50
	}
	rows, err := s.pool.Query(ctx, `
		SELECT id, project_id, service, COALESCE(version,''), change_type, metadata, deployed_at
		FROM deployments
		WHERE project_id = $1 AND deployed_at >= $2
		ORDER BY deployed_at DESC LIMIT $3`,
		orDefault(project), since, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanDeployments(rows)
}

func scanDeployments(rows pgx.Rows) ([]model.Deployment, error) {
	var out []model.Deployment
	for rows.Next() {
		var d model.Deployment
		var meta []byte
		if err := rows.Scan(&d.ID, &d.ProjectID, &d.Service, &d.Version, &d.ChangeType, &meta, &d.DeployedAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(meta, &d.Metadata)
		if d.Metadata == nil {
			d.Metadata = map[string]any{}
		}
		out = append(out, d)
	}
	return out, rows.Err()
}

func (s *Store) UpsertIncident(ctx context.Context, inc model.Incident) (int64, error) {
	rc, _ := json.Marshal(inc.RootCause)
	imp, _ := json.Marshal(inc.Impacted)
	blast, _ := json.Marshal(inc.BlastRadius)
	pb, _ := json.Marshal(inc.Playbook)
	project := orDefault(inc.ProjectID)
	var id int64
	err := s.pool.QueryRow(ctx, `
		SELECT id FROM incidents
		WHERE project_id = $1 AND fingerprint = $2 AND status = 'open'`,
		project, inc.Fingerprint).Scan(&id)
	if err != nil && err != pgx.ErrNoRows {
		return 0, err
	}
	if err == pgx.ErrNoRows {
		err = s.pool.QueryRow(ctx, `
			INSERT INTO incidents (
				project_id, title, status, severity, severity_label, primary_service,
				root_cause, impacted, blast_radius, playbook, fingerprint, started_at, resolved_at, updated_at
			) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now())
			RETURNING id`,
			project, inc.Title, inc.Status, inc.Severity, inc.SeverityLabel,
			inc.PrimaryService, rc, imp, blast, pb, inc.Fingerprint, inc.StartedAt, inc.ResolvedAt).Scan(&id)
	} else {
		err = s.pool.QueryRow(ctx, `
			UPDATE incidents SET
			  title = $3,
			  severity = $4,
			  severity_label = $5,
			  primary_service = $6,
			  root_cause = $7,
			  impacted = $8,
			  blast_radius = $9,
			  playbook = $10,
			  started_at = $11,
			  resolved_at = $12,
			  updated_at = now()
			WHERE id = $1 AND project_id = $2
			RETURNING id`,
			id, project, inc.Title, inc.Severity, inc.SeverityLabel,
			inc.PrimaryService, rc, imp, blast, pb, inc.StartedAt, inc.ResolvedAt).Scan(&id)
	}
	if err != nil {
		return 0, err
	}
	return id, nil
}

func (s *Store) GetIncident(ctx context.Context, project string, id int64) (*model.Incident, error) {
	row := s.pool.QueryRow(ctx, `
		SELECT id, project_id, title, status, severity, severity_label, primary_service,
		       root_cause, impacted, blast_radius, playbook, fingerprint, started_at, resolved_at, updated_at
		FROM incidents WHERE project_id = $1 AND id = $2`,
		orDefault(project), id)
	return scanIncidentRow(row)
}

func (s *Store) ListIncidents(ctx context.Context, project, status string, limit int) ([]model.Incident, error) {
	if limit <= 0 {
		limit = 50
	}
	b := &sqlBuilder{}
	b.where("project_id = %s", orDefault(project))
	if status != "" {
		b.where("status = %s", status)
	}
	q := fmt.Sprintf(`
		SELECT id, project_id, title, status, severity, severity_label, primary_service,
		       root_cause, impacted, blast_radius, playbook, fingerprint, started_at, resolved_at, updated_at
		FROM incidents %s ORDER BY started_at DESC LIMIT %d`, b.clause(), limit)
	rows, err := s.pool.Query(ctx, q, b.args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.Incident
	for rows.Next() {
		inc, err := scanIncident(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, *inc)
	}
	return out, rows.Err()
}

func (s *Store) ResolveIncident(ctx context.Context, project string, id int64) error {
	_, err := s.pool.Exec(ctx, `
		UPDATE incidents SET status = 'resolved', resolved_at = now(), updated_at = now()
		WHERE project_id = $1 AND id = $2`, orDefault(project), id)
	return err
}

func (s *Store) AutoResolveIncidents(ctx context.Context, project string, olderThan time.Time) (int64, error) {
	tag, err := s.pool.Exec(ctx, `
		UPDATE incidents SET status = 'resolved', resolved_at = now(), updated_at = now()
		WHERE project_id = $1 AND status = 'open' AND updated_at < $2`,
		orDefault(project), olderThan)
	return tag.RowsAffected(), err
}

func (s *Store) CountOpenIncidents(ctx context.Context, project string) (int, int, error) {
	var total, critical int
	err := s.pool.QueryRow(ctx, `
		SELECT count(*), count(*) FILTER (WHERE severity_label = 'critical')
		FROM incidents WHERE project_id = $1 AND status = 'open'`,
		orDefault(project)).Scan(&total, &critical)
	return total, critical, err
}

func (s *Store) ReplaceIncidentEvents(ctx context.Context, incidentID int64, events []model.IncidentEvent) error {
	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)
	if _, err := tx.Exec(ctx, `DELETE FROM incident_events WHERE incident_id = $1`, incidentID); err != nil {
		return err
	}
	for _, e := range events {
		ev, _ := json.Marshal(orEmptyMap(e.Evidence))
		if _, err := tx.Exec(ctx, `
			INSERT INTO incident_events (incident_id, event_type, service, summary, evidence, occurred_at)
			VALUES ($1,$2,$3,$4,$5,$6)`,
			incidentID, e.EventType, nullIfEmpty(e.Service), e.Summary, ev, e.OccurredAt); err != nil {
			return err
		}
	}
	return tx.Commit(ctx)
}

func (s *Store) ListIncidentEvents(ctx context.Context, incidentID int64) ([]model.IncidentEvent, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, incident_id, event_type, COALESCE(service,''), summary, evidence, occurred_at
		FROM incident_events WHERE incident_id = $1 ORDER BY occurred_at ASC`, incidentID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.IncidentEvent
	for rows.Next() {
		var e model.IncidentEvent
		var meta []byte
		if err := rows.Scan(&e.ID, &e.IncidentID, &e.EventType, &e.Service, &e.Summary, &meta, &e.OccurredAt); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(meta, &e.Evidence)
		if e.Evidence == nil {
			e.Evidence = map[string]any{}
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func (s *Store) ListServiceEdges(ctx context.Context, project string) ([]model.DependencyEdge, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT parent, child, call_count, error_count
		FROM service_edges WHERE project_id = $1 ORDER BY call_count DESC`,
		orDefault(project))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []model.DependencyEdge
	for rows.Next() {
		var e model.DependencyEdge
		if err := rows.Scan(&e.Parent, &e.Child, &e.CallCount, &e.ErrorCount); err != nil {
			return nil, err
		}
		out = append(out, e)
	}
	return out, rows.Err()
}

func scanIncidentRow(row pgx.Row) (*model.Incident, error) {
	var inc model.Incident
	var rc, imp, blast, pb []byte
	var resolved *time.Time
	if err := row.Scan(
		&inc.ID, &inc.ProjectID, &inc.Title, &inc.Status, &inc.Severity, &inc.SeverityLabel,
		&inc.PrimaryService, &rc, &imp, &blast, &pb, &inc.Fingerprint, &inc.StartedAt, &resolved, &inc.UpdatedAt,
	); err != nil {
		return nil, err
	}
	_ = json.Unmarshal(rc, &inc.RootCause)
	_ = json.Unmarshal(imp, &inc.Impacted)
	_ = json.Unmarshal(blast, &inc.BlastRadius)
	_ = json.Unmarshal(pb, &inc.Playbook)
	inc.ResolvedAt = resolved
	return &inc, nil
}

func scanIncident(rows pgx.Rows) (*model.Incident, error) {
	var inc model.Incident
	var rc, imp, blast, pb []byte
	var resolved *time.Time
	if err := rows.Scan(
		&inc.ID, &inc.ProjectID, &inc.Title, &inc.Status, &inc.Severity, &inc.SeverityLabel,
		&inc.PrimaryService, &rc, &imp, &blast, &pb, &inc.Fingerprint, &inc.StartedAt, &resolved, &inc.UpdatedAt,
	); err != nil {
		return nil, err
	}
	_ = json.Unmarshal(rc, &inc.RootCause)
	_ = json.Unmarshal(imp, &inc.Impacted)
	_ = json.Unmarshal(blast, &inc.BlastRadius)
	_ = json.Unmarshal(pb, &inc.Playbook)
	inc.ResolvedAt = resolved
	return &inc, nil
}

// ServiceMetrics holds current window stats for a service.
type ServiceMetrics struct {
	Service   string
	SpanCount int64
	ErrorCount int64
	ErrorRate float64
	P50US     int64
	P95US     int64
	P99US     int64
}

func (s *Store) ServiceMetricsWindow(ctx context.Context, project string, since time.Time) ([]ServiceMetrics, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT service_name,
		       count(*) AS span_count,
		       count(*) FILTER (WHERE status_code = 'ERROR') AS error_count,
		       COALESCE(percentile_cont(0.50) WITHIN GROUP (ORDER BY duration_us), 0)::bigint AS p50,
		       COALESCE(percentile_cont(0.95) WITHIN GROUP (ORDER BY duration_us), 0)::bigint AS p95,
		       COALESCE(percentile_cont(0.99) WITHIN GROUP (ORDER BY duration_us), 0)::bigint AS p99
		FROM spans
		WHERE project_id = $1 AND start_time >= $2
		GROUP BY service_name`,
		orDefault(project), since)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var out []ServiceMetrics
	for rows.Next() {
		var m ServiceMetrics
		if err := rows.Scan(&m.Service, &m.SpanCount, &m.ErrorCount, &m.P50US, &m.P95US, &m.P99US); err != nil {
			return nil, err
		}
		if m.SpanCount > 0 {
			m.ErrorRate = float64(m.ErrorCount) / float64(m.SpanCount)
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

func (s *Store) SampleTraceIDs(ctx context.Context, project, service string, since time.Time, onlyErrors bool, limit int) ([]string, error) {
	if limit <= 0 {
		limit = 5
	}
	errFilter := ""
	if onlyErrors {
		errFilter = ` AND status_code = 'ERROR'`
	}
	q := fmt.Sprintf(`
		SELECT trace_id FROM (
			SELECT trace_id, max(duration_us) AS dur FROM spans
			WHERE project_id = $1 AND service_name = $2 AND start_time >= $3%s
			GROUP BY trace_id
		) t ORDER BY dur DESC LIMIT $4`, errFilter)
	rows, err := s.pool.Query(ctx, q, orDefault(project), service, since, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	return scanStrings(rows)
}
