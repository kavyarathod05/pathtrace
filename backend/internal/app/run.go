// Package app wires PathTrace components and starts HTTP/gRPC servers.
package app

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/pathtrace/pathtrace/internal/alerts"
	"github.com/pathtrace/pathtrace/internal/analytics"
	"github.com/pathtrace/pathtrace/internal/config"
	"github.com/pathtrace/pathtrace/internal/ingest"
	"github.com/pathtrace/pathtrace/internal/livetail"
	"github.com/pathtrace/pathtrace/internal/query"
	"github.com/pathtrace/pathtrace/internal/queue"
	"github.com/pathtrace/pathtrace/internal/ratelimit"
	"github.com/pathtrace/pathtrace/internal/sampling"
	"github.com/pathtrace/pathtrace/internal/seed"
	"github.com/pathtrace/pathtrace/internal/storage/postgres"
)

// Run boots storage, ingest/query pipelines, and blocking servers until ctx ends.
func Run(ctx context.Context, cfg config.Config) error {
	var embedded *postgres.Embedded
	dsn := cfg.DatabaseURL
	if cfg.EmbeddedDB {
		log.Printf("starting embedded Postgres...")
		e, err := postgres.StartEmbedded(os.Getenv("PT_DATA_DIR"))
		if err != nil {
			return fmt.Errorf("embedded postgres: %w", err)
		}
		embedded = e
		dsn = e.DSN()
	}

	store, err := postgres.New(ctx, dsn)
	if err != nil {
		return fmt.Errorf("storage: %w", err)
	}
	defer store.Close()

	if cfg.AutoSeedDemo && cfg.QueryEnabled() {
		maybeSeedDemo(ctx, cfg, store)
	}

	// Render's free tier has no cron service, so the query/all role runs
	// retention + alert evaluation in-process on a periodic ticker.
	if cfg.QueryEnabled() {
		go runMaintenance(ctx, cfg, store)
	}

	hub := livetail.NewHub()
	sampler := sampling.New(cfg.SampleRate)
	writer := ingest.NewWriter(store, sampler, hub, cfg.BatchSize, 2*time.Second)
	defer writer.Close()

	var bridge *queue.Bridge
	if cfg.RedisURL != "" {
		bridge, err = queue.NewBridge(cfg.RedisURL)
		if err != nil {
			return fmt.Errorf("redis: %w", err)
		}
		defer bridge.Close()
	}

	// Collector + all-in-one push to Redis; query drains Redis when split.
	pipelineBridge := bridge
	if cfg.Role == config.RoleAll {
		pipelineBridge = nil
	}
	pipeline := ingest.NewPipeline(sampler, writer, pipelineBridge)

	if bridge != nil && cfg.Role == config.RoleQuery {
		ingest.StartRedisWorker(ctx, bridge, writer)
		ingest.StartRedisLiveRelay(ctx, bridge, hub)
	}

	limiter := ratelimit.New(cfg.RateLimitRPM)
	engine := analytics.New(store.Pool())
	api := query.New(cfg, store, engine, writer, pipeline, hub, limiter)

	if cfg.IngestEnabled() {
		grpcSrv := ingest.NewGRPCServer(cfg, pipeline, limiter)
		go func() {
			if err := grpcSrv.Start(ctx); err != nil {
				log.Printf("grpc server: %v", err)
			}
		}()
	}

	srv := &http.Server{
		Addr:         "0.0.0.0:" + cfg.Port,
		Handler:      api.Handler(),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 0,
		IdleTimeout:  120 * time.Second,
	}

	go func() {
		log.Printf("HTTP listening on :%s role=%s ingest=%v query=%v", cfg.Port, cfg.Role, cfg.IngestEnabled(), cfg.QueryEnabled())
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Printf("http server: %v", err)
		}
	}()

	<-ctx.Done()
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(shutdownCtx)
	writer.Close()
	if embedded != nil {
		_ = embedded.Stop()
	}
	return nil
}

// runMaintenance periodically deletes spans past the retention window and
// evaluates alert rules. It replaces the standalone cron job on free tiers.
func runMaintenance(ctx context.Context, cfg config.Config, store *postgres.Store) {
	engine := analytics.New(store.Pool())
	eval := alerts.New(store, engine)
	interval := 5 * time.Minute
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	sweep := func() {
		cutoff := time.Now().Add(-time.Duration(cfg.RetentionHrs) * time.Hour)
		if deleted, err := store.DeleteOlderThan(ctx, cutoff); err != nil {
			log.Printf("maintenance: retention sweep failed: %v", err)
		} else if deleted > 0 {
			log.Printf("maintenance: deleted %d spans older than %s", deleted, cutoff.Format(time.RFC3339))
		}
		for _, project := range cfg.ListProjects() {
			if _, err := eval.EvaluateProject(ctx, project); err != nil {
				log.Printf("maintenance: alert eval for %q failed: %v", project, err)
			}
		}
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			sweep()
		}
	}
}

func maybeSeedDemo(ctx context.Context, cfg config.Config, store *postgres.Store) {
	n, err := store.SpanCount(ctx, cfg.DemoProject)
	if err != nil {
		return
	}
	if n > 0 {
		hasTags, err := store.HasSearchableTags(ctx, cfg.DemoProject)
		if err != nil || hasTags {
			return
		}
		log.Printf("demo project %q has legacy tagless data; adding tagged demo traces...", cfg.DemoProject)
	} else {
		log.Printf("seeding demo project %q...", cfg.DemoProject)
	}
	endpoint := fmt.Sprintf("http://127.0.0.1:%s/v1/traces", cfg.Port)
	// Start seed in background after a short delay so HTTP is up.
	go func() {
		time.Sleep(2 * time.Second)
		if err := seed.Demo(endpoint, cfg.DemoProject, 600); err != nil {
			log.Printf("demo seed: %v", err)
		} else {
			log.Printf("demo seed complete")
		}
	}()
}
