package main

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"net/url"
	"strings"
	"time"
)

// openDatabase opens the pgx-backed pool and verifies connectivity before the
// worker starts accepting traffic.
func openDatabase(cfg config) (*sql.DB, error) {
	db, err := sql.Open("pgx", cfg.DatabaseURL)
	if err != nil {
		return nil, fmt.Errorf("open database: %w", err)
	}
	db.SetMaxOpenConns(cfg.MaxOpenConns)
	db.SetMaxIdleConns(1)
	db.SetConnMaxIdleTime(2 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	defer cancel()
	if err := db.PingContext(ctx); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("database health check failed: %w", err)
	}
	return db, nil
}

// Prisma-specific query parameters are not PostgreSQL runtime parameters and
// must not be forwarded to pgx. Keep normal PostgreSQL options such as sslmode.
func normalizeDatabaseURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.Scheme != "postgres" && u.Scheme != "postgresql" {
		return "", errors.New("DATABASE_URL must use postgres:// or postgresql://")
	}
	query := u.Query()
	for _, key := range []string{"connection_limit", "pool_timeout", "pgbouncer", "schema", "sslaccept"} {
		query.Del(key)
	}
	// Preserve a caller-supplied label so separate deployments can be attributed
	// independently; otherwise give this worker a stable PostgreSQL application name.
	if strings.TrimSpace(query.Get("application_name")) == "" {
		query.Set("application_name", "marketplat-go-worker")
	}
	u.RawQuery = query.Encode()
	return u.String(), nil
}
