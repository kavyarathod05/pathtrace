// Command collector runs the ingest-only PathTrace role (OTLP HTTP + gRPC → Redis).
package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/pathtrace/pathtrace/internal/app"
	"github.com/pathtrace/pathtrace/internal/config"
)

func main() {
	log.SetPrefix("[pathtrace-collector] ")
	cfg := config.Load()
	cfg.Role = config.RoleCollector
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err := app.Run(ctx, cfg); err != nil {
		log.Fatalf("fatal: %v", err)
	}
}
