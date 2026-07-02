package postgres

import (
	"fmt"
	"os"
	"path/filepath"

	embeddedpostgres "github.com/fergusstrange/embedded-postgres"
)

// Embedded manages a local Postgres instance for development. It downloads a
// real Postgres binary on first use and stores data under the given directory,
// so local dev needs no Docker and no manual Postgres install. Production uses
// a managed Postgres via DATABASE_URL instead.
type Embedded struct {
	pg  *embeddedpostgres.EmbeddedPostgres
	dsn string
}

// StartEmbedded launches an embedded Postgres and returns its DSN plus a
// stop function. dataDir persists the cluster across restarts.
func StartEmbedded(dataDir string) (*Embedded, error) {
	if dataDir == "" {
		dataDir = ".pt-data"
	}
	abs, err := filepath.Abs(dataDir)
	if err != nil {
		return nil, err
	}
	if err := os.MkdirAll(abs, 0o755); err != nil {
		return nil, err
	}

	const (
		user = "pathtrace"
		pass = "pathtrace"
		db   = "pathtrace"
		port = 55432
	)
	cfg := embeddedpostgres.DefaultConfig().
		Username(user).
		Password(pass).
		Database(db).
		Port(port).
		RuntimePath(filepath.Join(abs, "runtime")).
		DataPath(filepath.Join(abs, "data")).
		BinariesPath(filepath.Join(abs, "bin")).
		CachePath(filepath.Join(abs, "cache"))

	pg := embeddedpostgres.NewDatabase(cfg)
	if err := pg.Start(); err != nil {
		return nil, fmt.Errorf("start embedded postgres: %w", err)
	}
	dsn := fmt.Sprintf("postgres://%s:%s@localhost:%d/%s?sslmode=disable", user, pass, port, db)
	return &Embedded{pg: pg, dsn: dsn}, nil
}

// DSN returns the connection string for the embedded instance.
func (e *Embedded) DSN() string { return e.dsn }

// Stop shuts the embedded instance down.
func (e *Embedded) Stop() error { return e.pg.Stop() }
