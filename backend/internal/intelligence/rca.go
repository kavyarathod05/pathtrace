package intelligence

import (
	"context"
	"fmt"
	"time"

	"github.com/pathtrace/pathtrace/internal/model"
)

func (r *Runner) analyzeRCA(ctx context.Context, project string, inc model.Incident, since time.Time) model.RootCause {
	traceIDs, _ := r.store.SampleTraceIDs(ctx, project, inc.PrimaryService, since, inc.SeverityLabel == "critical", 5)
	if len(traceIDs) == 0 {
		traceIDs, _ = r.store.SampleTraceIDs(ctx, project, inc.PrimaryService, since, false, 5)
	}
	hotspots, _ := r.engine.Hotspots(ctx, project, time.Duration(windowMin)*time.Minute, 5)
	bottleneck := inc.PrimaryService
	var op string
	var reasoning []string
	for _, h := range hotspots {
		if h.Service == inc.PrimaryService {
			bottleneck = h.Service
			op = h.Operation
			reasoning = append(reasoning, fmt.Sprintf("error rate %.1f%% on %s", h.ErrorRate*100, h.Operation))
			break
		}
	}
	confidence := 0.55
	if len(traceIDs) > 0 {
		confidence += 0.15
	}
	if op != "" {
		confidence += 0.12
	}
	if confidence > 0.95 {
		confidence = 0.95
	}
	hypothesis := fmt.Sprintf("%s degradation — likely bottleneck in %s", inc.PrimaryService, bottleneck)
	if op != "" {
		hypothesis = fmt.Sprintf("%s on %s causing %s issues", op, bottleneck, inc.PrimaryService)
	}
	return model.RootCause{
		Hypothesis:            hypothesis,
		Confidence:            confidence,
		BottleneckService:     bottleneck,
		BottleneckOperation:   op,
		LatencyInjectionPoint: fmt.Sprintf("upstream → %s", bottleneck),
		EvidenceTraceIDs:      traceIDs,
		Reasoning:             reasoning,
	}
}
