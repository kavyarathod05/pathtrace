// Package queue abstracts span buffering between collector and query roles.
// When Redis is configured, spans are pushed to a list and published on a live
// channel; otherwise the direct in-process writer is used.
package queue

import (
	"context"
	"encoding/json"
	"fmt"
	"time"

	"github.com/pathtrace/pathtrace/internal/model"
	"github.com/redis/go-redis/v9"
)

const (
	spanListKey  = "pathtrace:span_queue"
	liveChannel  = "pathtrace:live"
)

// Bridge moves spans between collector and query processes via Redis.
type Bridge struct {
	client *redis.Client
}

// NewBridge connects to Redis. Caller must call Close when done.
func NewBridge(redisURL string) (*Bridge, error) {
	opt, err := redis.ParseURL(redisURL)
	if err != nil {
		return nil, fmt.Errorf("parse redis url: %w", err)
	}
	client := redis.NewClient(opt)
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if err := client.Ping(ctx).Err(); err != nil {
		return nil, fmt.Errorf("redis ping: %w", err)
	}
	return &Bridge{client: client}, nil
}

func (b *Bridge) Close() error { return b.client.Close() }

// Push enqueues a JSON batch of spans and publishes each for live tail subscribers.
func (b *Bridge) Push(ctx context.Context, spans []model.Span) error {
	if len(spans) == 0 {
		return nil
	}
	raw, err := json.Marshal(spans)
	if err != nil {
		return err
	}
	pipe := b.client.Pipeline()
	pipe.LPush(ctx, spanListKey, raw)
	for _, sp := range spans {
		if one, err := json.Marshal(sp); err == nil {
			pipe.Publish(ctx, liveChannel, one)
		}
	}
	_, err = pipe.Exec(ctx)
	return err
}

// PopBatch blocks up to timeout waiting for a span batch from the queue.
func (b *Bridge) PopBatch(ctx context.Context, timeout time.Duration) ([]model.Span, error) {
	res, err := b.client.BRPop(ctx, timeout, spanListKey).Result()
	if err == redis.Nil {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	if len(res) < 2 {
		return nil, nil
	}
	var spans []model.Span
	if err := json.Unmarshal([]byte(res[1]), &spans); err != nil {
		return nil, err
	}
	return spans, nil
}

// SubscribeLive returns a channel of spans from the Redis pub/sub live channel.
func (b *Bridge) SubscribeLive(ctx context.Context) (<-chan model.Span, func(), error) {
	sub := b.client.Subscribe(ctx, liveChannel)
	ch := make(chan model.Span, 256)
	go func() {
		defer close(ch)
		for msg := range sub.Channel() {
			var sp model.Span
			if err := json.Unmarshal([]byte(msg.Payload), &sp); err == nil {
				select {
				case ch <- sp:
				default:
				}
			}
		}
	}()
	unsub := func() { _ = sub.Close() }
	return ch, unsub, nil
}
