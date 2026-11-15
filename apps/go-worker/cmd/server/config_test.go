package main

import (
	"strings"
	"testing"

	"marketplat/apps/go-worker/internal/analyticsretention"
)

// workerEnvNames lists every variable loadConfig (directly or through
// rediswire) reads, so each test starts from a known-empty environment.
var workerEnvNames = []string{
	"GO_WORKER_DATABASE_URL", "DIRECT_URL", "DATABASE_URL", "GO_WORKER_TOKEN",
	"GO_WORKER_OUTBOX_ENABLED", "GO_WORKER_PUSH_DISPATCH_ENABLED", "GO_WORKER_SEARCH_INDEX_ENABLED",
	"ANALYTICS_RETENTION_DAYS", "ANALYTICS_RETENTION_BATCH_SIZE", "DB_MAX_OPEN_CONNS",
	"GO_WORKER_API_URL", "GO_WORKER_ADDR",
	"GO_WORKER_BUFFER_REDIS_URL", "REDIS_BUFFER_URL", "GO_WORKER_REDIS_URL", "REDIS_URL",
	"GO_WORKER_BUFFER_REDIS_HOST", "GO_WORKER_REDIS_HOST", "REDIS_HOST",
	"GO_WORKER_CACHE_REDIS_URL", "REDIS_CACHE_URL", "GO_WORKER_CACHE_REDIS_HOST", "REDIS_CACHE_HOST",
}

func resetWorkerEnv(t *testing.T) {
	t.Helper()
	for _, name := range workerEnvNames {
		t.Setenv(name, "")
	}
}

func setMinimalWorkerEnv(t *testing.T) {
	t.Helper()
	resetWorkerEnv(t)
	t.Setenv("DATABASE_URL", "postgresql://user:pass@db.example:5432/app")
	t.Setenv("GO_WORKER_TOKEN", "secret")
}

func TestLoadConfigRequiresDatabaseURLAndToken(t *testing.T) {
	resetWorkerEnv(t)
	if _, err := loadConfig(); err == nil {
		t.Fatal("expected an error when the database URL and token are missing")
	}

	t.Setenv("DATABASE_URL", "postgresql://user:pass@db.example:5432/app")
	if _, err := loadConfig(); err == nil {
		t.Fatal("expected an error when the token is missing")
	}
}

func TestLoadConfigAppliesDefaults(t *testing.T) {
	setMinimalWorkerEnv(t)
	cfg, err := loadConfig()
	if err != nil {
		t.Fatalf("loadConfig returned unexpected error: %v", err)
	}
	if cfg.Addr != defaultListenAddr {
		t.Fatalf("Addr = %q, want %q", cfg.Addr, defaultListenAddr)
	}
	if cfg.RetentionDays != defaultRetentionDays {
		t.Fatalf("RetentionDays = %d, want %d", cfg.RetentionDays, defaultRetentionDays)
	}
	if cfg.BatchSize != analyticsretention.DefaultBatchSize {
		t.Fatalf("BatchSize = %d, want %d", cfg.BatchSize, analyticsretention.DefaultBatchSize)
	}
	if cfg.MaxOpenConns != defaultMaxOpenConns {
		t.Fatalf("MaxOpenConns = %d, want %d", cfg.MaxOpenConns, defaultMaxOpenConns)
	}
	if cfg.OutboxEnabled || cfg.PushDispatchEnabled || cfg.SearchIndexEnabled {
		t.Fatal("optional background workers must be disabled by default")
	}
	if cfg.Token != "secret" {
		t.Fatalf("Token = %q, want secret", cfg.Token)
	}
}

func TestLoadConfigStripsPrismaOnlyConnectionParameters(t *testing.T) {
	setMinimalWorkerEnv(t)
	t.Setenv("DATABASE_URL", "postgresql://user:pass@db.example:5432/app?schema=public&sslmode=require&connection_limit=5&pgbouncer=true")
	cfg, err := loadConfig()
	if err != nil {
		t.Fatalf("loadConfig returned unexpected error: %v", err)
	}
	if !strings.Contains(cfg.DatabaseURL, "sslmode=require") {
		t.Fatalf("DatabaseURL lost sslmode: %s", cfg.DatabaseURL)
	}
	for _, forbidden := range []string{"schema=", "connection_limit=", "pgbouncer="} {
		if strings.Contains(cfg.DatabaseURL, forbidden) {
			t.Fatalf("DatabaseURL still contains %s: %s", forbidden, cfg.DatabaseURL)
		}
	}
}

func TestLoadConfigRejectsInvalidValues(t *testing.T) {
	cases := []struct {
		name  string
		key   string
		value string
	}{
		{name: "retention too low", key: "ANALYTICS_RETENTION_DAYS", value: "0"},
		{name: "retention too high", key: "ANALYTICS_RETENTION_DAYS", value: "3651"},
		{name: "retention not a number", key: "ANALYTICS_RETENTION_DAYS", value: "ninety"},
		{name: "batch too high", key: "ANALYTICS_RETENTION_BATCH_SIZE", value: "50001"},
		{name: "pool too large", key: "DB_MAX_OPEN_CONNS", value: "17"},
		{name: "pool too small", key: "DB_MAX_OPEN_CONNS", value: "0"},
		{name: "bad boolean", key: "GO_WORKER_OUTBOX_ENABLED", value: "maybe"},
		{name: "non-postgres URL", key: "DATABASE_URL", value: "mysql://user:pass@db.example/app"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			setMinimalWorkerEnv(t)
			t.Setenv(tc.key, tc.value)
			if _, err := loadConfig(); err == nil {
				t.Fatalf("expected %s=%q to be rejected", tc.key, tc.value)
			}
		})
	}
}

func TestLoadConfigOutboxRequirements(t *testing.T) {
	t.Run("needs cache redis", func(t *testing.T) {
		setMinimalWorkerEnv(t)
		t.Setenv("GO_WORKER_OUTBOX_ENABLED", "true")
		_, err := loadConfig()
		if err == nil || !strings.Contains(err.Error(), "cache Redis") {
			t.Fatalf("expected a cache Redis error, got %v", err)
		}
	})

	t.Run("needs API URL", func(t *testing.T) {
		setMinimalWorkerEnv(t)
		t.Setenv("GO_WORKER_OUTBOX_ENABLED", "true")
		t.Setenv("REDIS_URL", "redis://localhost:6379")
		_, err := loadConfig()
		if err == nil || !strings.Contains(err.Error(), "GO_WORKER_API_URL") {
			t.Fatalf("expected an API URL error, got %v", err)
		}
	})

	t.Run("valid", func(t *testing.T) {
		setMinimalWorkerEnv(t)
		t.Setenv("GO_WORKER_OUTBOX_ENABLED", "true")
		t.Setenv("REDIS_URL", "redis://localhost:6379")
		t.Setenv("GO_WORKER_API_URL", "http://localhost:3000/")
		cfg, err := loadConfig()
		if err != nil {
			t.Fatalf("loadConfig returned unexpected error: %v", err)
		}
		if cfg.APIBaseURL != "http://localhost:3000" {
			t.Fatalf("APIBaseURL = %q, want normalised origin", cfg.APIBaseURL)
		}
	})

	t.Run("outbox plus push needs four connections", func(t *testing.T) {
		setMinimalWorkerEnv(t)
		t.Setenv("GO_WORKER_OUTBOX_ENABLED", "true")
		t.Setenv("GO_WORKER_PUSH_DISPATCH_ENABLED", "true")
		t.Setenv("REDIS_URL", "redis://localhost:6379")
		t.Setenv("GO_WORKER_API_URL", "http://localhost:3000")
		t.Setenv("DB_MAX_OPEN_CONNS", "3")
		if _, err := loadConfig(); err == nil {
			t.Fatal("expected outbox plus push dispatch to require at least four connections")
		}
		t.Setenv("DB_MAX_OPEN_CONNS", "4")
		if _, err := loadConfig(); err != nil {
			t.Fatalf("four connections should be accepted, got %v", err)
		}
	})
}

func TestNormalizeDatabaseURLRejectsUnsupportedSchemes(t *testing.T) {
	if _, err := normalizeDatabaseURL("http://example.com/db"); err == nil {
		t.Fatal("expected a non-postgres scheme to be rejected")
	}
	if _, err := normalizeDatabaseURL("postgres://user:pass@db.example/app?sslmode=require"); err != nil {
		t.Fatalf("postgres:// should be accepted, got %v", err)
	}
}
