// Package intelligence materializes incidents, root cause, blast radius, and playbooks
// from span telemetry using periodic batch jobs against Postgres.
package intelligence

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/pathtrace/pathtrace/internal/analytics"
	"github.com/pathtrace/pathtrace/internal/model"
	"github.com/pathtrace/pathtrace/internal/storage/postgres"
)

const windowMin = 60

// Runner orchestrates the intelligence pipeline for a project.
type Runner struct {
	store  *postgres.Store
	engine *analytics.Engine
}

func NewRunner(store *postgres.Store, pool *pgxpool.Pool) *Runner {
	return &Runner{store: store, engine: analytics.New(pool)}
}

// RunProject executes the full intelligence pipeline.
func (r *Runner) RunProject(ctx context.Context, project string) error {
	since := time.Now().Add(-time.Duration(windowMin) * time.Minute)
	if err := r.store.RebuildServiceEdges(ctx, project, since); err != nil {
		return fmt.Errorf("edges: %w", err)
	}
	if err := r.detectDeployments(ctx, project, since); err != nil {
		return fmt.Errorf("deployments: %w", err)
	}
	// Detect against prior baselines before this run overwrites them.
	incidents, err := r.detectIncidents(ctx, project, since)
	if err != nil {
		return fmt.Errorf("incidents: %w", err)
	}
	if err := r.updateBaselines(ctx, project, since); err != nil {
		return fmt.Errorf("baselines: %w", err)
	}
	for _, inc := range incidents {
		id, err := r.store.UpsertIncident(ctx, inc)
		if err != nil {
			return fmt.Errorf("upsert incident: %w", err)
		}
		inc.ID = id
		rc := r.analyzeRCA(ctx, project, inc, since)
		inc.RootCause = rc
		blast := r.computeBlast(ctx, project, inc)
		inc.BlastRadius = blast
		inc.Impacted = impactedFromBlast(blast, inc.PrimaryService, inc.Severity)
		inc.Playbook = generatePlaybook(inc, rc, project)
		if _, err := r.store.UpsertIncident(ctx, inc); err != nil {
			return fmt.Errorf("update incident: %w", err)
		}
		events := buildTimeline(inc, rc)
		if err := r.store.ReplaceIncidentEvents(ctx, inc.ID, events); err != nil {
			return fmt.Errorf("timeline: %w", err)
		}
	}
	_, _ = r.store.AutoResolveIncidents(ctx, project, time.Now().Add(-15*time.Minute))
	if err := r.bootstrapDemoIncidents(ctx, project); err != nil {
		return fmt.Errorf("demo bootstrap: %w", err)
	}
	return nil
}

func (r *Runner) updateBaselines(ctx context.Context, project string, since time.Time) error {
	metrics, err := r.store.ServiceMetricsWindow(ctx, project, since)
	if err != nil {
		return err
	}
	minutes := windowMin
	if minutes <= 0 {
		minutes = 1
	}
	for _, m := range metrics {
		_ = r.store.UpsertService(ctx, project, m.Service, time.Now())
		_ = r.store.UpsertBaseline(ctx, model.ServiceBaseline{
			ProjectID:  project,
			Service:    m.Service,
			WindowMin:  windowMin,
			ErrorRate:  m.ErrorRate,
			P50US:      m.P50US,
			P95US:      m.P95US,
			P99US:      m.P99US,
			Throughput: float64(m.SpanCount) / float64(minutes),
		})
	}
	return nil
}

func (r *Runner) detectDeployments(ctx context.Context, project string, since time.Time) error {
	rows, err := r.store.Pool().Query(ctx, `
		SELECT service_name,
		       COALESCE(max(tags->>'service.version'), max(tags->>'deployment.version'), '') AS ver,
		       max(start_time) AS seen
		FROM spans
		WHERE project_id = $1 AND start_time >= $2
		  AND (tags ? 'service.version' OR tags ? 'deployment.version')
		GROUP BY service_name
		HAVING COALESCE(max(tags->>'service.version'), max(tags->>'deployment.version'), '') <> ''`,
		orDefault(project), since)
	if err != nil {
		return err
	}
	defer rows.Close()
	for rows.Next() {
		var svc, ver string
		var seen time.Time
		if err := rows.Scan(&svc, &ver, &seen); err != nil {
			return err
		}
		if ver == "" {
			continue
		}
		_, _ = r.store.CreateDeployment(ctx, model.Deployment{
			ProjectID:  project,
			Service:    svc,
			Version:    ver,
			ChangeType: "deploy",
			DeployedAt: seen,
		})
	}
	return rows.Err()
}

type signal struct {
	service    string
	signalType string
	errorRate  float64
	p95US      int64
	severity   int
}

func (r *Runner) detectIncidents(ctx context.Context, project string, since time.Time) ([]model.Incident, error) {
	metrics, err := r.store.ServiceMetricsWindow(ctx, project, since)
	if err != nil {
		return nil, err
	}
	baselines, _ := r.store.ListBaselines(ctx, project, windowMin)
	baseMap := map[string]model.ServiceBaseline{}
	for _, b := range baselines {
		baseMap[b.Service] = b
	}
	var signals []signal
	for _, m := range metrics {
		b, ok := baseMap[m.Service]
		sig := signal{service: m.Service}
		if !ok {
			if m.ErrorRate > 0.02 && m.ErrorCount > 2 {
				sig.signalType = "error_spike"
				sig.errorRate = m.ErrorRate
				sig.severity += 45
			}
			if m.P95US > 500_000 && m.SpanCount > 5 {
				if sig.signalType == "" {
					sig.signalType = "latency_spike"
				}
				sig.p95US = m.P95US
				sig.severity += 35
			}
		} else {
			if m.ErrorRate > math.Max(b.ErrorRate*2, 0.05) && m.ErrorCount > 0 {
				sig.signalType = "error_spike"
				sig.errorRate = m.ErrorRate
				sig.severity += 40
			}
			if b.P95US > 0 && float64(m.P95US) > float64(b.P95US)*1.5 {
				if sig.signalType == "" {
					sig.signalType = "latency_spike"
				}
				sig.p95US = m.P95US
				sig.severity += 30
			}
		}
		if sig.signalType != "" {
			if m.ErrorRate > 0.1 {
				sig.severity += 20
			}
			sig.severity = min(100, sig.severity)
			signals = append(signals, sig)
		}
	}
	var out []model.Incident
	for _, sig := range signals {
		title := fmt.Sprintf("%s %s detected", sig.service, strings.ReplaceAll(sig.signalType, "_", " "))
		fp := fingerprint(project, sig.service, sig.signalType)
		label := severityLabel(sig.severity)
		out = append(out, model.Incident{
			ProjectID:      project,
			Title:          title,
			Status:         "open",
			Severity:       sig.severity,
			SeverityLabel:  label,
			PrimaryService: sig.service,
			Fingerprint:    fp,
			StartedAt:      time.Now(),
		})
	}
	return out, nil
}

func fingerprint(project, service, signalType string) string {
	hour := time.Now().UTC().Format("2006010215")
	raw := project + "|" + service + "|" + signalType + "|" + hour
	sum := sha256.Sum256([]byte(raw))
	return hex.EncodeToString(sum[:16])
}

func severityLabel(score int) string {
	switch {
	case score >= 70:
		return "critical"
	case score >= 40:
		return "warning"
	default:
		return "info"
	}
}

func orDefault(project string) string {
	if project == "" {
		return "default"
	}
	return project
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
