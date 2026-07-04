package intelligence

import (
	"context"
	"fmt"
	"time"

	"github.com/pathtrace/pathtrace/internal/model"
)

func generatePlaybook(inc model.Incident, rc model.RootCause) []model.PlaybookStep {
	var steps []model.PlaybookStep
	priority := 1
	if rc.BottleneckOperation != "" {
		steps = append(steps, model.PlaybookStep{
			Priority:  priority,
			Action:    fmt.Sprintf("Check error logs for %s on %s", rc.BottleneckOperation, rc.BottleneckService),
			Rationale: "Highest error concentration identified by trace analysis",
		})
		priority++
	}
	if inc.SeverityLabel == "critical" || inc.Severity >= 70 {
		steps = append(steps, model.PlaybookStep{
			Priority:  priority,
			Action:    fmt.Sprintf("Verify %s health endpoint and recent deployments", inc.PrimaryService),
			Rationale: "Critical severity — check for recent changes first",
		})
		priority++
	}
	if rc.BottleneckService != "" && rc.BottleneckService != inc.PrimaryService {
		steps = append(steps, model.PlaybookStep{
			Priority:  priority,
			Action:    fmt.Sprintf("Inspect dependency %s connection pool / timeouts", rc.BottleneckService),
			Rationale: "Latency injection point identified upstream",
		})
		priority++
	}
	if len(rc.EvidenceTraceIDs) > 0 {
		steps = append(steps, model.PlaybookStep{
			Priority:  priority,
			Action:    fmt.Sprintf("Review %d evidence traces for common failure pattern", len(rc.EvidenceTraceIDs)),
			Rationale: "Sample traces contain correlated errors",
		})
	}
	if len(steps) == 0 {
		steps = append(steps, model.PlaybookStep{
			Priority:  1,
			Action:    fmt.Sprintf("Check metrics and logs for %s", inc.PrimaryService),
			Rationale: "Default investigation step",
		})
	}
	return steps
}

func buildTimeline(inc model.Incident, rc model.RootCause) []model.IncidentEvent {
	now := time.Now()
	events := []model.IncidentEvent{
		{
			IncidentID: inc.ID,
			EventType:  "incident_opened",
			Service:    inc.PrimaryService,
			Summary:    inc.Title,
			OccurredAt: inc.StartedAt,
		},
	}
	if rc.Hypothesis != "" {
		events = append(events, model.IncidentEvent{
			IncidentID: inc.ID,
			EventType:  "root_cause",
			Service:    rc.BottleneckService,
			Summary:    rc.Hypothesis,
			Evidence:   map[string]any{"confidence": rc.Confidence, "traceIds": rc.EvidenceTraceIDs},
			OccurredAt: now,
		})
	}
	for _, t := range rc.EvidenceTraceIDs {
		events = append(events, model.IncidentEvent{
			IncidentID: inc.ID,
			EventType:  "evidence",
			Service:    inc.PrimaryService,
			Summary:    "Evidence trace captured",
			Evidence:   map[string]any{"traceId": t},
			OccurredAt: now,
		})
	}
	return events
}

// Overview builds the system intelligence summary.
func (r *Runner) Overview(ctx context.Context, project string) (model.IntelligenceOverview, error) {
	open, critical, err := r.store.CountOpenIncidents(ctx, project)
	if err != nil {
		return model.IntelligenceOverview{}, err
	}
	recent, _ := r.store.ListIncidents(ctx, project, "open", 5)
	status := "healthy"
	insight := "All systems operating normally — no active incidents"
	topImpacted := ""
	if open > 0 {
		status = "degraded"
		insight = fmt.Sprintf("%d active incident(s) detected — investigate primary service impact", open)
		if len(recent) > 0 {
			topImpacted = recent[0].PrimaryService
			if recent[0].RootCause.Hypothesis != "" {
				insight = recent[0].RootCause.Hypothesis
			} else {
				insight = fmt.Sprintf("%s — %s", recent[0].Title, recent[0].PrimaryService)
			}
		}
	}
	if critical > 0 {
		status = "critical"
	}
	return model.IntelligenceOverview{
		SystemStatus:      status,
		ActiveIncidents:   open,
		CriticalIncidents: critical,
		TopImpacted:       topImpacted,
		Insight:           insight,
		RecentIncidents:   recent,
	}, nil
}
