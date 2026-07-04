package intelligence

import (
	"context"

	"github.com/pathtrace/pathtrace/internal/model"
)

func (r *Runner) computeBlast(ctx context.Context, project string, inc model.Incident) []model.BlastRadiusEntry {
	edges, err := r.store.ListServiceEdges(ctx, project)
	if err != nil {
		return nil
	}
	adj := map[string][]model.DependencyEdge{}
	for _, e := range edges {
		adj[e.Parent] = append(adj[e.Parent], e)
	}
	var out []model.BlastRadiusEntry
	visited := map[string]bool{}
	queue := []struct {
		svc      string
		hop      int
		severity int
	}{{inc.PrimaryService, 0, inc.Severity}}
	for len(queue) > 0 {
		cur := queue[0]
		queue = queue[1:]
		if visited[cur.svc] {
			continue
		}
		visited[cur.svc] = true
		var errRate float64
		var calls int64
		for _, e := range adj[cur.svc] {
			if e.CallCount > 0 {
				errRate = float64(e.ErrorCount) / float64(e.CallCount)
				calls = e.CallCount
			}
		}
		out = append(out, model.BlastRadiusEntry{
			Service:    cur.svc,
			Hop:        cur.hop,
			Severity:   cur.severity,
			ErrorRate:  errRate,
			CallVolume: calls,
		})
		childSev := int(float64(cur.severity) * 0.7)
		for _, e := range adj[cur.svc] {
			queue = append(queue, struct {
				svc      string
				hop      int
				severity int
			}{e.Child, cur.hop + 1, childSev})
		}
	}
	return out
}

func impactedFromBlast(blast []model.BlastRadiusEntry, primary string, severity int) []model.ImpactedService {
	var out []model.ImpactedService
	for _, b := range blast {
		if b.Service == primary {
			continue
		}
		out = append(out, model.ImpactedService{
			Service:   b.Service,
			Severity:  b.Severity,
			ErrorRate: b.ErrorRate,
		})
	}
	return out
}
