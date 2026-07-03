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

// Evaluator checks rules and records alert events with state transitions.
type Evaluator struct {
	store  *postgres.Store
	engine *analytics.Engine
	notify *Sender
}

// New creates an evaluator.
func New(store *postgres.Store, engine *analytics.Engine) *Evaluator {
	return &Evaluator{store: store, engine: engine, notify: NewSender()}
}

// EvaluateProject runs every enabled rule for a project once.
// Returns the number of state transitions (firing or resolved).
func (e *Evaluator) EvaluateProject(ctx context.Context, project string) (int, error) {
	rules, err := e.store.ListAlertRules(ctx, project)
	if err != nil {
		return 0, err
	}
	transitions := 0
	for _, r := range rules {
		if !r.Enabled {
			continue
		}
		if e.evaluateRule(ctx, r) {
			transitions++
		}
	}
	return transitions, nil
}

func (e *Evaluator) evaluateRule(ctx context.Context, r model.AlertRule) bool {
	window := time.Duration(r.WindowSec) * time.Second
	value, hasData, err := e.engine.MetricValue(ctx, r.ProjectID, r.Service, r.Metric, window)
	if err != nil {
		log.Printf("alerts: metric %s for rule %d: %v", r.Metric, r.ID, err)
		return false
	}
	breached := hasData && compare(r.Op, value, r.Threshold)

	st, _ := e.store.GetAlertState(ctx, r.ID)
	now := time.Now()

	switch st.State {
	case "firing":
		if !breached {
			_ = e.store.RecordAlertEvent(ctx, r.ID, value, r.Threshold, "resolved", r.Severity)
			_ = e.store.UpsertAlertState(ctx, model.AlertState{RuleID: r.ID, State: "ok", Since: now})
			e.maybeNotify(ctx, r, "resolved", value)
			return true
		}
		return false
	case "pending":
		if breached {
			if r.ForSec <= 0 || now.Sub(st.Since) >= time.Duration(r.ForSec)*time.Second {
				_ = e.store.RecordAlertEvent(ctx, r.ID, value, r.Threshold, "firing", r.Severity)
				t := now
				_ = e.store.UpsertAlertState(ctx, model.AlertState{RuleID: r.ID, State: "firing", Since: now, LastNotified: &t})
				e.maybeNotify(ctx, r, "firing", value)
				return true
			}
		} else {
			_ = e.store.UpsertAlertState(ctx, model.AlertState{RuleID: r.ID, State: "ok", Since: now})
		}
		return false
	default: // ok
		if breached {
			if r.ForSec <= 0 {
				_ = e.store.RecordAlertEvent(ctx, r.ID, value, r.Threshold, "firing", r.Severity)
				t := now
				_ = e.store.UpsertAlertState(ctx, model.AlertState{RuleID: r.ID, State: "firing", Since: now, LastNotified: &t})
				e.maybeNotify(ctx, r, "firing", value)
				return true
			}
			_ = e.store.UpsertAlertState(ctx, model.AlertState{RuleID: r.ID, State: "pending", Since: now})
		}
		return false
	}
}

func (e *Evaluator) maybeNotify(ctx context.Context, r model.AlertRule, state string, value float64) {
	if r.ChannelID == nil {
		return
	}
	st, _ := e.store.GetAlertState(ctx, r.ID)
	if st.LastNotified != nil && r.CooldownSec > 0 {
		if time.Since(*st.LastNotified) < time.Duration(r.CooldownSec)*time.Second {
			return
		}
	}
	ch, err := e.store.GetNotificationChannel(ctx, r.ProjectID, *r.ChannelID)
	if err != nil {
		log.Printf("alerts: channel %d: %v", *r.ChannelID, err)
		return
	}
	if err := e.notify.Send(ctx, ch, r, state, value); err != nil {
		log.Printf("alerts: notify rule %d: %v", r.ID, err)
	}
}

func compare(op string, value, threshold float64) bool {
	switch op {
	case ">":
		return value > threshold
	case "<":
		return value < threshold
	case ">=":
		return value >= threshold
	case "<=":
		return value <= threshold
	default:
		return false
	}
}
