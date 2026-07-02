// Package config loads PathTrace configuration from environment variables with
// sensible local-development defaults.
package config

import (
	"os"
	"strconv"
	"strings"
)

// Role determines which subsystems this process runs.
type Role string

const (
	RoleAll       Role = "all"       // ingest + query (default, free-tier friendly)
	RoleCollector Role = "collector" // ingest only → optional Redis queue
	RoleQuery     Role = "query"     // read API + Redis worker + live tail
)

// Config holds runtime configuration for the server and jobs.
type Config struct {
	Role         Role
	Port         string
	GRPCPort     string
	DatabaseURL  string
	RedisURL     string
	EmbeddedDB   bool
	CORSOrigin   string
	SampleRate   float64
	IngestKeys   map[string]string // key -> projectID
	DemoProject  string
	AutoSeedDemo bool
	RetentionHrs int
	BatchSize    int
	RateLimitRPM int // max ingest requests per minute per API key; 0 = unlimited
	PublicURL    string // advertised ingest URL for /api/connect
}

// Load reads configuration from the environment.
func Load() Config {
	c := Config{
		Role:         Role(strings.ToLower(env("ROLE", "all"))),
		Port:         env("PORT", "8080"),
		GRPCPort:     env("GRPC_PORT", "4317"),
		DatabaseURL:  env("DATABASE_URL", ""),
		RedisURL:     env("REDIS_URL", ""),
		EmbeddedDB:   envBool("EMBEDDED_DB", false),
		CORSOrigin:   env("CORS_ORIGIN", "*"),
		SampleRate:   envFloat("SAMPLE_RATE", 1.0),
		DemoProject:  env("DEMO_PROJECT", "demo"),
		AutoSeedDemo: envBool("AUTO_SEED_DEMO", true),
		RetentionHrs: envInt("RETENTION_HOURS", 72),
		BatchSize:    envInt("BATCH_SIZE", 500),
		RateLimitRPM: envInt("RATE_LIMIT_RPM", 600),
		PublicURL:    env("PUBLIC_URL", ""),
		IngestKeys:   parseKeys(env("INGEST_KEYS", "")),
	}
	if c.PublicURL == "" {
		c.PublicURL = "http://localhost:" + c.Port
	}
	if c.DatabaseURL == "" && !c.EmbeddedDB {
		c.EmbeddedDB = true
	}
	// Ensure demo project is always readable when keys are configured.
	if len(c.IngestKeys) > 0 {
		if _, ok := c.IngestKeys["demo"]; !ok {
			// demo is viewable without a key; ingest uses demo-public key if set in docs
		}
	}
	return c
}

// IngestEnabled returns true when this process should accept OTLP traffic.
func (c Config) IngestEnabled() bool {
	return c.Role == RoleAll || c.Role == RoleCollector
}

// QueryEnabled returns true when this process should serve read APIs.
func (c Config) QueryEnabled() bool {
	return c.Role == RoleAll || c.Role == RoleQuery
}

// ProjectForKey resolves an ingest key to a project ID. When no keys are
// configured, all ingestion maps to the demo project (open local mode).
func (c Config) ProjectForKey(key string) (string, bool) {
	if len(c.IngestKeys) == 0 {
		if c.DemoProject != "" {
			return c.DemoProject, true
		}
		return "default", true
	}
	if key == "" {
		// Allow unkeyed ingest only to demo in keyed mode.
		return c.DemoProject, true
	}
	proj, ok := c.IngestKeys[key]
	return proj, ok
}

// ListProjects returns project IDs known from config keys plus the demo project.
func (c Config) ListProjects() []string {
	seen := map[string]struct{}{}
	if c.DemoProject != "" {
		seen[c.DemoProject] = struct{}{}
	}
	for _, p := range c.IngestKeys {
		seen[p] = struct{}{}
	}
	out := make([]string, 0, len(seen))
	for p := range seen {
		out = append(out, p)
	}
	if len(out) == 0 {
		return []string{"default"}
	}
	return out
}

func parseKeys(raw string) map[string]string {
	out := map[string]string{}
	for _, pair := range strings.Split(raw, ",") {
		pair = strings.TrimSpace(pair)
		if pair == "" {
			continue
		}
		parts := strings.SplitN(pair, ":", 2)
		if len(parts) == 2 {
			out[strings.TrimSpace(parts[0])] = strings.TrimSpace(parts[1])
		}
	}
	return out
}

func env(key, def string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return def
}

func envBool(key string, def bool) bool {
	if v := os.Getenv(key); v != "" {
		b, err := strconv.ParseBool(v)
		if err == nil {
			return b
		}
	}
	return def
}

func envInt(key string, def int) int {
	if v := os.Getenv(key); v != "" {
		n, err := strconv.Atoi(v)
		if err == nil {
			return n
		}
	}
	return def
}

func envFloat(key string, def float64) float64 {
	if v := os.Getenv(key); v != "" {
		f, err := strconv.ParseFloat(v, 64)
		if err == nil {
			return f
		}
	}
	return def
}
