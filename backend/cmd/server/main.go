// Command server runs PathTrace in all-in-one mode (ingest + query) by default.
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
	log.SetFlags(log.LstdFlags | log.Lmsgprefix)
	log.SetPrefix("[pathtrace] ")

	cfg := config.Load()
	ctx, cancel := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer cancel()

	if err := app.Run(ctx, cfg); err != nil {
		log.Fatalf("fatal: %v", err)
	}
}
