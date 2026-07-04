// Command cron performs scheduled maintenance: it deletes spans older than the
// retention window (to stay within the free Postgres storage cap) and evaluates
// alert rules. On Render this runs as a scheduled Cron Job; locally you can run
// it manually or on a timer.
package main

import (
	"context"
	"log"
	"time"

	"github.com/pathtrace/pathtrace/internal/alerts"
	"github.com/pathtrace/pathtrace/internal/analytics"
	"github.com/pathtrace/pathtrace/internal/config"
	"github.com/pathtrace/pathtrace/internal/intelligence"
	"github.com/pathtrace/pathtrace/internal/storage/postgres"
)

func main() {
	log.SetPrefix("[pathtrace-cron] ")
	cfg := config.Load()
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	dsn := cfg.DatabaseURL
	if dsn == "" {
		log.Fatalf("DATABASE_URL is required for the cron job")
	}

	store, err := postgres.New(ctx, dsn)
	if err != nil {
		log.Fatalf("storage: %v", err)
	}
	defer store.Close()

	// Retention sweep.
	cutoff := time.Now().Add(-time.Duration(cfg.RetentionHrs) * time.Hour)
	deleted, err := store.DeleteOlderThan(ctx, cutoff)
	if err != nil {
		log.Printf("retention sweep failed: %v", err)
	} else {
		log.Printf("retention: deleted %d spans older than %s", deleted, cutoff.Format(time.RFC3339))
	}

	// Alert evaluation for the default project.
	engine := analytics.New(store.Pool())
	eval := alerts.New(store, engine)
	fired, err := eval.EvaluateProject(ctx, "default")
	if err != nil {
		log.Printf("alert evaluation failed: %v", err)
	} else {
		log.Printf("alerts: %d rule(s) fired", fired)
	}

	// Intelligence pipeline.
	intel := intelligence.NewRunner(store, store.Pool())
	for _, project := range cfg.ListProjects() {
		if err := intel.RunProject(ctx, project); err != nil {
			log.Printf("intelligence for %q failed: %v", project, err)
		} else {
			log.Printf("intelligence: processed project %q", project)
		}
	}
}
