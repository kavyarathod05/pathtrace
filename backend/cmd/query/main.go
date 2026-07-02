// Command query runs the read-only PathTrace role (query API + Redis worker).
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
	log.SetPrefix("[pathtrace-query] ")
	cfg := config.Load()
	cfg.Role = config.RoleQuery
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()
	if err := app.Run(ctx, cfg); err != nil {
		log.Fatalf("fatal: %v", err)
	}
}
