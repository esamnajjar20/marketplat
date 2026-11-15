package main

import (
	"errors"
	"fmt"
	"os"
	"strconv"
	"strings"

	"marketplat/apps/go-worker/internal/analyticsretention"
	"marketplat/apps/go-worker/internal/rediswire"
)

const (
	defaultListenAddr        = ":8081"
	defaultRetentionDays     = 90
	maxRetentionDays         = 3650
	maxRetentionBatchSize    = 50000
	defaultMaxOpenConns      = 2
	maxAllowedOpenConns      = 16
	minConnsForOutbox        = 2
	minConnsForOutboxAndPush = 4
)

// config is the validated, immutable process configuration. Parsing lives in
// loadConfig so that every environment rule can be unit-tested without
// starting the server or touching the database.
type config struct {
	DatabaseURL         string
	Token               string
	Addr                string
	APIBaseURL          string
	OutboxEnabled       bool
	PushDispatchEnabled bool
	SearchIndexEnabled  bool
	RetentionDays       int
	BatchSize           int
	MaxOpenConns        int
	Redis               *rediswire.Config
	CacheRedis          *rediswire.Config
}

func loadConfig() (config, error) {
	var cfg config
	var err error

	databaseURL := firstNonEmptyEnv("GO_WORKER_DATABASE_URL", "DIRECT_URL", "DATABASE_URL")
	if databaseURL != "" {
		if databaseURL, err = normalizeDatabaseURL(databaseURL); err != nil {
			return cfg, fmt.Errorf("invalid DATABASE_URL: %w", err)
		}
	}
	cfg.DatabaseURL = databaseURL
	cfg.Token = strings.TrimSpace(os.Getenv("GO_WORKER_TOKEN"))

	if cfg.OutboxEnabled, err = envBool("GO_WORKER_OUTBOX_ENABLED", false); err != nil {
		return cfg, fmt.Errorf("invalid GO_WORKER_OUTBOX_ENABLED: %w", err)
	}
	if cfg.PushDispatchEnabled, err = envBool("GO_WORKER_PUSH_DISPATCH_ENABLED", false); err != nil {
		return cfg, fmt.Errorf("invalid GO_WORKER_PUSH_DISPATCH_ENABLED: %w", err)
	}
	if cfg.SearchIndexEnabled, err = envBool("GO_WORKER_SEARCH_INDEX_ENABLED", false); err != nil {
		return cfg, fmt.Errorf("invalid GO_WORKER_SEARCH_INDEX_ENABLED: %w", err)
	}
	if cfg.DatabaseURL == "" || cfg.Token == "" {
		return cfg, errors.New("GO_WORKER_DATABASE_URL, DIRECT_URL, or DATABASE_URL and GO_WORKER_TOKEN are required")
	}

	if cfg.RetentionDays, err = envIntInRange("ANALYTICS_RETENTION_DAYS", defaultRetentionDays, 1, maxRetentionDays); err != nil {
		return cfg, err
	}
	if cfg.BatchSize, err = envIntInRange("ANALYTICS_RETENTION_BATCH_SIZE", analyticsretention.DefaultBatchSize, 1, maxRetentionBatchSize); err != nil {
		return cfg, err
	}
	if cfg.MaxOpenConns, err = envIntInRange("DB_MAX_OPEN_CONNS", defaultMaxOpenConns, 1, maxAllowedOpenConns); err != nil {
		return cfg, err
	}
	if cfg.OutboxEnabled && cfg.MaxOpenConns < minConnsForOutbox {
		return cfg, errors.New("GO_WORKER_OUTBOX_ENABLED requires DB_MAX_OPEN_CONNS of at least 2 so lease heartbeats can run beside the event transaction")
	}
	if cfg.OutboxEnabled && cfg.PushDispatchEnabled && cfg.MaxOpenConns < minConnsForOutboxAndPush {
		return cfg, errors.New("enabling both Go Outbox and Push Dispatch requires DB_MAX_OPEN_CONNS of at least 4 to avoid starving independent lease heartbeats")
	}

	if cfg.Redis, err = rediswire.ConfigFromEnv(); err != nil {
		return cfg, fmt.Errorf("invalid Redis configuration: %w", err)
	}
	if cfg.CacheRedis, err = rediswire.CacheConfigFromEnv(cfg.Redis); err != nil {
		return cfg, fmt.Errorf("invalid cache Redis configuration: %w", err)
	}

	cfg.APIBaseURL = strings.TrimSpace(os.Getenv("GO_WORKER_API_URL"))
	if cfg.OutboxEnabled && cfg.CacheRedis == nil {
		return cfg, errors.New("GO_WORKER_OUTBOX_ENABLED requires a configured cache Redis connection")
	}
	if cfg.OutboxEnabled || cfg.PushDispatchEnabled {
		if cfg.APIBaseURL, err = normalizeAPIBaseURL(cfg.APIBaseURL); err != nil {
			return cfg, fmt.Errorf("GO_WORKER_OUTBOX_ENABLED or GO_WORKER_PUSH_DISPATCH_ENABLED requires a valid GO_WORKER_API_URL: %w", err)
		}
	}

	cfg.Addr = strings.TrimSpace(os.Getenv("GO_WORKER_ADDR"))
	if cfg.Addr == "" {
		cfg.Addr = defaultListenAddr
	}
	return cfg, nil
}

// envIntInRange reads an integer environment variable and enforces lo <= n <= hi.
func envIntInRange(name string, fallback, lo, hi int) (int, error) {
	value, err := envInt(name, fallback)
	if err != nil {
		return 0, fmt.Errorf("invalid %s: %w", name, err)
	}
	if value < lo || value > hi {
		return 0, fmt.Errorf("%s must be between %d and %d", name, lo, hi)
	}
	return value, nil
}

func envBool(name string, fallback bool) (bool, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	parsed, err := strconv.ParseBool(value)
	if err != nil {
		return false, err
	}
	return parsed, nil
}

func firstNonEmptyEnv(names ...string) string {
	for _, name := range names {
		if value := strings.TrimSpace(os.Getenv(name)); value != "" {
			return value
		}
	}
	return ""
}

func envInt(name string, fallback int) (int, error) {
	value := strings.TrimSpace(os.Getenv(name))
	if value == "" {
		return fallback, nil
	}
	n, err := strconv.Atoi(value)
	if err != nil {
		return 0, errors.New(name + " must be an integer")
	}
	return n, nil
}
