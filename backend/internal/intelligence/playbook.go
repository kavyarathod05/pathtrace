package intelligence

import (
	"context"
	"fmt"
	"time"

	"github.com/pathtrace/pathtrace/internal/model"
)

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
	if len(rc.EvidenceTraceIDs) > 0 {
		events = append(events, model.IncidentEvent{
			IncidentID: inc.ID,
			EventType:  "evidence",
			Service:    inc.PrimaryService,
			Summary:    fmt.Sprintf("%d evidence trace(s) captured for analysis", len(rc.EvidenceTraceIDs)),
			Evidence:   map[string]any{"traceIds": rc.EvidenceTraceIDs},
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
			insight = fmt.Sprintf("%d open incident(s) affecting %s — review details below", open, topImpacted)
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
