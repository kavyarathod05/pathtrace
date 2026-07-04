// Package alerts sends alert notifications to webhooks and Slack (notify.go).
package alerts

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/pathtrace/pathtrace/internal/model"
)

// Sender dispatches alert notifications.
type Sender struct {
	client *http.Client
}

// NewSender creates a notification sender.
func NewSender() *Sender {
	return &Sender{client: &http.Client{Timeout: 10 * time.Second}}
}

// Send delivers an alert transition to the configured channel.
func (s *Sender) Send(ctx context.Context, ch *model.NotificationChannel, rule model.AlertRule, state string, value float64) error {
	if ch == nil {
		return nil
	}
	switch ch.Type {
	case "slack":
		return s.sendSlack(ctx, ch, rule, state, value)
	default:
		return s.sendWebhook(ctx, ch, rule, state, value)
	}
}

func (s *Sender) sendWebhook(ctx context.Context, ch *model.NotificationChannel, rule model.AlertRule, state string, value float64) error {
	url, _ := ch.Config["url"].(string)
	if url == "" {
		return fmt.Errorf("webhook url missing")
	}
	body := map[string]any{
		"rule":      rule.Name,
		"service":   rule.Service,
		"metric":    rule.Metric,
		"state":     state,
		"value":     value,
		"threshold": rule.Threshold,
		"severity":  rule.Severity,
		"time":      time.Now().UTC(),
	}
	return s.postJSON(ctx, url, body)
}

func (s *Sender) sendSlack(ctx context.Context, ch *model.NotificationChannel, rule model.AlertRule, state string, value float64) error {
	url, _ := ch.Config["url"].(string)
	if url == "" {
		return fmt.Errorf("slack webhook url missing")
	}
	emoji := "🔴"
	if state == "resolved" {
		emoji = "✅"
	}
	text := fmt.Sprintf("%s *%s* — %s (%s %s %.4g, threshold %.4g)",
		emoji, rule.Name, state, rule.Service, rule.Metric, value, rule.Threshold)
	return s.postJSON(ctx, url, map[string]string{"text": text})
}

func (s *Sender) postJSON(ctx context.Context, url string, body any) error {
	b, err := json.Marshal(body)
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	res, err := s.client.Do(req)
	if err != nil {
		return err
	}
	defer res.Body.Close()
	if res.StatusCode >= 300 {
		return fmt.Errorf("notify: status %d", res.StatusCode)
	}
	return nil
}
