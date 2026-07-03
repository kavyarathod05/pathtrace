package postgres

import (
	"context"
	"encoding/json"

	"github.com/pathtrace/pathtrace/internal/model"
)

// ListNotificationChannels returns channels for a project.
func (s *Store) ListNotificationChannels(ctx context.Context, project string) ([]model.NotificationChannel, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT id, project_id, name, type, config
		FROM notification_channels WHERE project_id=$1 ORDER BY id`,
		orDefault(project))
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []model.NotificationChannel{}
	for rows.Next() {
		var ch model.NotificationChannel
		var cfg []byte
		if err := rows.Scan(&ch.ID, &ch.ProjectID, &ch.Name, &ch.Type, &cfg); err != nil {
			return nil, err
		}
		_ = json.Unmarshal(cfg, &ch.Config)
		if ch.Config == nil {
			ch.Config = map[string]any{}
		}
		out = append(out, ch)
	}
	return out, rows.Err()
}

// CreateNotificationChannel inserts a channel and returns its ID.
func (s *Store) CreateNotificationChannel(ctx context.Context, ch model.NotificationChannel) (int64, error) {
	cfg, _ := json.Marshal(orEmptyMap(ch.Config))
	if ch.Type == "" {
		ch.Type = "webhook"
	}
	var id int64
	err := s.pool.QueryRow(ctx, `
		INSERT INTO notification_channels (project_id, name, type, config)
		VALUES ($1,$2,$3,$4) RETURNING id`,
		orDefault(ch.ProjectID), ch.Name, ch.Type, cfg,
	).Scan(&id)
	return id, err
}

// DeleteNotificationChannel removes a channel by ID.
func (s *Store) DeleteNotificationChannel(ctx context.Context, project string, id int64) error {
	_, err := s.pool.Exec(ctx, `DELETE FROM notification_channels WHERE project_id=$1 AND id=$2`,
		orDefault(project), id)
	return err
}

// GetNotificationChannel loads a single channel.
func (s *Store) GetNotificationChannel(ctx context.Context, project string, id int64) (*model.NotificationChannel, error) {
	var ch model.NotificationChannel
	var cfg []byte
	err := s.pool.QueryRow(ctx, `
		SELECT id, project_id, name, type, config
		FROM notification_channels WHERE project_id=$1 AND id=$2`,
		orDefault(project), id,
	).Scan(&ch.ID, &ch.ProjectID, &ch.Name, &ch.Type, &cfg)
	if err != nil {
		return nil, err
	}
	_ = json.Unmarshal(cfg, &ch.Config)
	if ch.Config == nil {
		ch.Config = map[string]any{}
	}
	return &ch, nil
}
