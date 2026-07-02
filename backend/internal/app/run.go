// Package app wires PathTrace components and starts HTTP/gRPC servers.
package app

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

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

func maybeSeedDemo(ctx context.Context, cfg config.Config, store *postgres.Store) {
	n, err := store.SpanCount(ctx, cfg.DemoProject)
	if err != nil || n > 0 {
		return
	}
	log.Printf("seeding demo project %q...", cfg.DemoProject)
	endpoint := fmt.Sprintf("http://127.0.0.1:%s/v1/traces", cfg.Port)
	// Start seed in background after a short delay so HTTP is up.
	go func() {
		time.Sleep(2 * time.Second)
		if err := seed.Demo(endpoint, cfg.DemoProject, 250); err != nil {
			log.Printf("demo seed: %v", err)
		} else {
			log.Printf("demo seed complete")
		}
	}()
}
