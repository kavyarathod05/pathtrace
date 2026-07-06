package intelligence

import (
	"context"
	"fmt"
	"time"

	"github.com/pathtrace/pathtrace/internal/model"
)

// bootstrapDemoIncidents ensures the public demo project always has sample
// incidents when telemetry exists but detection thresholds did not fire.
func (r *Runner) bootstrapDemoIncidents(ctx context.Context, project string) error {
	open, _, err := r.store.CountOpenIncidents(ctx, project)
	if err != nil || open > 0 {
		return err
	}
	since := time.Now().Add(-time.Duration(windowMin) * time.Minute)
	metrics, err := r.store.ServiceMetricsWindow(ctx, project, since)
	if err != nil || len(metrics) == 0 {
		return err
	}
	// Pick the service with the worst error profile for a realistic demo incident.
	var target *struct {
		service   string
		errorRate float64
		p95       int64
	}
	for i := range metrics {
		m := metrics[i]
		if m.SpanCount < 3 {
			continue
		}
		if target == nil || m.ErrorRate > target.errorRate || (m.ErrorRate == target.errorRate && m.P95US > target.p95) {
			target = &struct {
				service   string
				errorRate float64
				p95       int64
			}{m.Service, m.ErrorRate, m.P95US}
		}
	}
	if target == nil {
		return nil
	}
	severity := 55
	label := "warning"
	if target.errorRate > 0.05 {
		severity = 78
		label = "critical"
	}
	traceIDs, _ := r.store.SampleTraceIDs(ctx, project, target.service, since, target.errorRate > 0.02, 3)
	inc := model.Incident{
		ProjectID:      project,
		Title:          fmt.Sprintf("%s degradation detected", target.service),
		Status:         "open",
		Severity:       severity,
		SeverityLabel:  label,
		PrimaryService: target.service,
		Fingerprint:    fingerprint(project, target.service, "demo_bootstrap"),
		StartedAt:      time.Now().Add(-15 * time.Minute),
		RootCause: model.RootCause{
			Hypothesis:        fmt.Sprintf("%s showing elevated errors/latency — likely causing downstream checkout impact", target.service),
			Confidence:        0.72,
			BottleneckService: target.service,
			EvidenceTraceIDs:  traceIDs,
			Reasoning: []string{
				fmt.Sprintf("error rate %.1f%% in last %dm window", target.errorRate*100, windowMin),
				fmt.Sprintf("p95 latency %dms", target.p95/1000),
			},
		},
	}
	id, err := r.store.UpsertIncident(ctx, inc)
	if err != nil {
		return err
	}
	inc.ID = id
	blast := r.computeBlast(ctx, project, inc)
	inc.BlastRadius = blast
	inc.Impacted = impactedFromBlast(blast, inc.PrimaryService, inc.Severity)
	inc.Playbook = generatePlaybook(inc, inc.RootCause, project)
	if _, err := r.store.UpsertIncident(ctx, inc); err != nil {
		return err
	}
	return r.store.ReplaceIncidentEvents(ctx, id, buildTimeline(inc, inc.RootCause))
}

// EnsureDemoIncidents materializes sample incidents for the demo project when
// telemetry exists but none are open yet.
func (r *Runner) EnsureDemoIncidents(ctx context.Context, project string) error {
	return r.bootstrapDemoIncidents(ctx, project)
}
