// Package alerts evaluates alert rules (SLO thresholds) against the analytics
// engine and records firings. It is invoked on a schedule by the cron job.
package alerts

import (
	"context"
	"log"
	"time"

	"github.com/pathtrace/pathtrace/internal/analytics"
	"github.com/pathtrace/pathtrace/internal/model"
	"github.com/pathtrace/pathtrace/internal/storage/postgres"
)

// Evaluator checks rules and records alert events.
type Evaluator struct {
	store  *postgres.Store
	engine *analytics.Engine
}

// New creates an evaluator.
func New(store *postgres.Store, engine *analytics.Engine) *Evaluator {
	return &Evaluator{store: store, engine: engine}
}

// EvaluateProject runs every rule for a project once and records firings.
// Returns the number of rules that fired.
func (e *Evaluator) EvaluateProject(ctx context.Context, project string) (int, error) {
	rules, err := e.store.ListAlertRules(ctx, project)
	if err != nil {
		return 0, err
	}
	fired := 0
	for _, r := range rules {
		ok, value := e.evaluate(ctx, r)
		if ok {
			if err := e.store.RecordAlertEvent(ctx, r.ID, value, r.Threshold); err != nil {
				log.Printf("alerts: record event for rule %d: %v", r.ID, err)
				continue
			}
			fired++
		}
	}
	return fired, nil
}

func (e *Evaluator) evaluate(ctx context.Context, r model.AlertRule) (bool, float64) {
	window := time.Duration(r.WindowSec) * time.Second
	value, hasData, err := e.engine.MetricValue(ctx, r.ProjectID, r.Service, r.Metric, window)
	if err != nil {
		log.Printf("alerts: metric %s for rule %d: %v", r.Metric, r.ID, err)
		return false, 0
	}
	if !hasData {
		return false, 0
	}
	switch r.Op {
	case ">":
		return value > r.Threshold, value
	case "<":
		return value < r.Threshold, value
	case ">=":
		return value >= r.Threshold, value
	case "<=":
		return value <= r.Threshold, value
	default:
		return false, value
	}
}
