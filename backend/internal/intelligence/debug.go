package intelligence

import (
	"context"
	"fmt"
	"net/url"
	"time"

	"github.com/pathtrace/pathtrace/internal/model"
)

func exploreHref(project, service, operation string, onlyErrors bool) string {
	q := url.Values{}
	q.Set("project", project)
	if service != "" {
		q.Set("service", service)
	}
	if operation != "" {
		q.Set("operation", operation)
	}
	if onlyErrors {
		q.Set("onlyErrors", "true")
	}
	return "/explore?" + q.Encode()
}

func traceHref(project, traceID string) string {
	return fmt.Sprintf("/traces/%s?project=%s", traceID, url.QueryEscape(project))
}

func generatePlaybook(inc model.Incident, rc model.RootCause, project string) []model.PlaybookStep {
	var steps []model.PlaybookStep
	priority := 1

	if rc.Hypothesis != "" {
		steps = append(steps, model.PlaybookStep{
			Priority:  priority,
			Action:    "Validate root cause hypothesis against live telemetry",
			Rationale: rc.Hypothesis,
			Kind:      "manual",
		})
		priority++
	}

	if rc.BottleneckOperation != "" && rc.BottleneckService != "" {
		steps = append(steps, model.PlaybookStep{
			Priority:  priority,
			Action:    fmt.Sprintf("Inspect failing operation %s on %s", rc.BottleneckOperation, rc.BottleneckService),
			Rationale: "Highest error concentration identified by trace analysis",
			Kind:      "explore",
			Href:      exploreHref(project, rc.BottleneckService, rc.BottleneckOperation, true),
			Service:   rc.BottleneckService,
			Operation: rc.BottleneckOperation,
		})
		priority++
	} else if rc.BottleneckService != "" {
		steps = append(steps, model.PlaybookStep{
			Priority:  priority,
			Action:    fmt.Sprintf("Filter error traces for %s", rc.BottleneckService),
			Rationale: "Bottleneck service identified in dependency analysis",
			Kind:      "explore",
			Href:      exploreHref(project, rc.BottleneckService, "", true),
			Service:   rc.BottleneckService,
		})
		priority++
	}

	if inc.SeverityLabel == "critical" || inc.Severity >= 70 {
		steps = append(steps, model.PlaybookStep{
			Priority:  priority,
			Action:    fmt.Sprintf("Check %s health metrics and recent deployments", inc.PrimaryService),
			Rationale: "Critical severity — verify recent changes and saturation first",
			Kind:      "link",
			Href:      fmt.Sprintf("/health?project=%s", url.QueryEscape(project)),
			Service:   inc.PrimaryService,
		})
		priority++
	}

	if rc.BottleneckService != "" && rc.BottleneckService != inc.PrimaryService {
		steps = append(steps, model.PlaybookStep{
			Priority:  priority,
			Action:    fmt.Sprintf("Inspect dependency %s for timeouts and pool exhaustion", rc.BottleneckService),
			Rationale: "Latency or errors may be injected upstream of the primary service",
			Kind:      "explore",
			Href:      exploreHref(project, rc.BottleneckService, "", true),
			Service:   rc.BottleneckService,
		})
		priority++
	}

	for _, tid := range rc.EvidenceTraceIDs {
		if priority > 8 {
			break
		}
		steps = append(steps, model.PlaybookStep{
			Priority:  priority,
			Action:    fmt.Sprintf("Review evidence trace %s…", tid[:min(8, len(tid))]),
			Rationale: "Sample trace captured during incident detection",
			Kind:      "trace",
			Href:      traceHref(project, tid),
			TraceID:   tid,
		})
		priority++
	}

	if inc.ID > 0 {
		steps = append(steps, model.PlaybookStep{
			Priority:  priority,
			Action:    "Map downstream blast radius and impacted services",
			Rationale: "Understand which services are affected beyond the primary",
			Kind:      "link",
			Href:      fmt.Sprintf("/incidents/%d/blast-radius?project=%s", inc.ID, url.QueryEscape(project)),
		})
		priority++
	}

	if len(steps) == 0 {
		steps = append(steps, model.PlaybookStep{
			Priority:  1,
			Action:    fmt.Sprintf("Check metrics and error traces for %s", inc.PrimaryService),
			Rationale: "Default investigation starting point",
			Kind:      "explore",
			Href:      exploreHref(project, inc.PrimaryService, "", true),
			Service:   inc.PrimaryService,
		})
	}
	return steps
}

// DebugContext assembles the interactive investigation workspace for an incident.
func (r *Runner) DebugContext(ctx context.Context, project string, inc model.Incident) (model.DebugContext, error) {
	since := time.Now().Add(-time.Duration(windowMin) * time.Minute)
	rc := inc.RootCause
	playbook := generatePlaybook(inc, rc, project)

	var evidence []model.TraceSummary
	if len(rc.EvidenceTraceIDs) > 0 {
		traces, err := r.store.GetTraces(ctx, project, rc.EvidenceTraceIDs)
		if err == nil {
			for _, t := range traces {
				evidence = append(evidence, t.Summary)
			}
		}
	}

	hotspots, _ := r.engine.Hotspots(ctx, project, time.Duration(windowMin)*time.Minute, 15)
	var filtered []model.Hotspot
	for _, h := range hotspots {
		if h.Service == inc.PrimaryService || h.Service == rc.BottleneckService {
			filtered = append(filtered, h)
		}
	}
	if len(filtered) == 0 && len(hotspots) > 0 {
		filtered = hotspots[:min(5, len(hotspots))]
	}

	deployments, _ := r.store.RecentDeployments(ctx, project, since, 8)
	if deployments == nil {
		deployments = []model.Deployment{}
	}
	if evidence == nil {
		evidence = []model.TraceSummary{}
	}
	if filtered == nil {
		filtered = []model.Hotspot{}
	}

	var health *model.ServiceHealth
	metrics, _ := r.store.ServiceMetricsWindow(ctx, project, since)
	minutes := windowMin
	if minutes <= 0 {
		minutes = 1
	}
	for _, m := range metrics {
		if m.Service == inc.PrimaryService {
			health = &model.ServiceHealth{
				Service:          m.Service,
				SpanCount:        m.SpanCount,
				ErrorCount:       m.ErrorCount,
				ErrorRate:        m.ErrorRate,
				P50US:            float64(m.P50US),
				P95US:            float64(m.P95US),
				P99US:            float64(m.P99US),
				ThroughputPerMin: float64(m.SpanCount) / float64(minutes),
			}
			break
		}
	}

	return model.DebugContext{
		IncidentID:     inc.ID,
		Title:          inc.Title,
		PrimaryService: inc.PrimaryService,
		Severity:       inc.Severity,
		SeverityLabel:  inc.SeverityLabel,
		Status:         inc.Status,
		Hypothesis:     rc.Hypothesis,
		Confidence:     rc.Confidence,
		Playbook:       playbook,
		Evidence:       evidence,
		Hotspots:       filtered,
		Deployments:    deployments,
		ServiceHealth:  health,
		Impacted:       inc.Impacted,
		BlastRadius:    inc.BlastRadius,
	}, nil
}
