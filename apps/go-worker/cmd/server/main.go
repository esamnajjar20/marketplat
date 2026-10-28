package main

import (
	"context"
	"crypto/subtle"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"marketplat/apps/go-worker/internal/analyticsretention"
)

const retentionLockID int64 = 731904281

type server struct {
	db            *sql.DB
	token         string
	retentionDays int
	batchSize     int
	logger        *slog.Logger
}

func main() {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))
	databaseURL := firstNonEmptyEnv("GO_WORKER_DATABASE_URL", "DIRECT_URL", "DATABASE_URL")
	if databaseURL != "" {
		var normalizeErr error
		databaseURL, normalizeErr = normalizeDatabaseURL(databaseURL)
		if normalizeErr != nil {
			logger.Error("invalid DATABASE_URL", "error", normalizeErr)
			os.Exit(1)
		}
	}
	token := strings.TrimSpace(os.Getenv("GO_WORKER_TOKEN"))
	if databaseURL == "" || token == "" {
		logger.Error("GO_WORKER_DATABASE_URL, DIRECT_URL, or DATABASE_URL and GO_WORKER_TOKEN are required")
		os.Exit(1)
	}

	retentionDays, err := envInt("ANALYTICS_RETENTION_DAYS", 90)
	if err != nil {
		logger.Error("invalid ANALYTICS_RETENTION_DAYS", "error", err)
		os.Exit(1)
	}
	if retentionDays < 1 || retentionDays > 3650 {
		logger.Error("ANALYTICS_RETENTION_DAYS must be between 1 and 3650")
		os.Exit(1)
	}
	batchSize, err := envInt("ANALYTICS_RETENTION_BATCH_SIZE", analyticsretention.DefaultBatchSize)
	if err != nil {
		logger.Error("invalid ANALYTICS_RETENTION_BATCH_SIZE", "error", err)
		os.Exit(1)
	}
	if batchSize < 1 || batchSize > 50000 {
		logger.Error("ANALYTICS_RETENTION_BATCH_SIZE must be between 1 and 50000")
		os.Exit(1)
	}
	maxOpenConns, err := envInt("DB_MAX_OPEN_CONNS", 2)
	if err != nil {
		logger.Error("invalid DB_MAX_OPEN_CONNS", "error", err)
		os.Exit(1)
	}
	if maxOpenConns < 1 || maxOpenConns > 16 {
		logger.Error("DB_MAX_OPEN_CONNS must be between 1 and 16")
		os.Exit(1)
	}
	db, err := sql.Open("pgx", databaseURL)
	if err != nil {
		logger.Error("open database", "error", err)
		os.Exit(1)
	}
	defer db.Close()
	db.SetMaxOpenConns(maxOpenConns)
	db.SetMaxIdleConns(1)
	db.SetConnMaxIdleTime(2 * time.Minute)

	ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
	err = db.PingContext(ctx)
	cancel()
	if err != nil {
		logger.Error("database health check failed", "error", err)
		os.Exit(1)
	}

	s := &server{db: db, token: token, retentionDays: retentionDays, batchSize: batchSize, logger: logger}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("POST /internal/jobs/analytics-retention", s.runAnalyticsRetention)

	addr := strings.TrimSpace(os.Getenv("GO_WORKER_ADDR"))
	if addr == "" {
		addr = ":8081"
	}
	httpServer := &http.Server{
		Addr:              addr,
		Handler:           securityHeaders(mux),
		ReadHeaderTimeout: 3 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      10 * time.Minute,
		IdleTimeout:       60 * time.Second,
	}
	logger.Info("MarketPlat Go worker listening", "addr", addr, "retentionDays", retentionDays, "batchSize", batchSize)
	if err := httpServer.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		logger.Error("HTTP server failed", "error", err)
		os.Exit(1)
	}
}

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.PingContext(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unhealthy"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "marketplat-go-worker"})
}

func (s *server) runAnalyticsRetention(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	// Express sends its configured retention window so both implementations
	// apply the same policy. Reject unknown/oversized bodies rather than silently
	// accepting malformed internal requests.
	var request struct {
		RetentionDays *int `json:"retentionDays"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must contain one JSON object"})
		return
	}
	retentionDays := s.retentionDays
	if request.RetentionDays != nil {
		retentionDays = *request.RetentionDays
	}
	if retentionDays < 1 || retentionDays > 3650 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "retentionDays must be between 1 and 3650"})
		return
	}

	// A session-level advisory lock prevents two Go worker instances from
	// running this maintenance task concurrently. The lock connection stays
	// checked out for the entire job; max-open-conns is intentionally small.
	conn, err := s.db.Conn(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		return
	}
	defer conn.Close()
	var acquired bool
	if err := conn.QueryRowContext(r.Context(), `SELECT pg_try_advisory_lock($1)`, retentionLockID).Scan(&acquired); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "could not acquire job lock"})
		return
	}
	if !acquired {
		writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
		return
	}
	lockReleased := false
	releaseLock := func() {
		if lockReleased {
			return
		}
		lockReleased = true
		unlockCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		var unlocked bool
		if err := conn.QueryRowContext(unlockCtx, `SELECT pg_advisory_unlock($1)`, retentionLockID).Scan(&unlocked); err != nil || !unlocked {
			s.logger.Warn("analytics retention advisory lock release failed", "error", err)
		}
	}
	defer releaseLock()

	// Leave a response window before the Express caller's 9-minute timeout.
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Minute+30*time.Second)
	result, err := analyticsretention.Run(ctx, conn, retentionDays, s.batchSize, time.Now())
	cancel()
	// Release before responding so an Express fallback triggered by a failed
	// response cannot race this worker's final batch.
	releaseLock()
	if err != nil {
		s.logger.Error("analytics retention job failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "analytics retention failed"})
		return
	}
	s.logger.Info("analytics retention completed", "deleted", result.Deleted, "batches", result.Batches, "cutoff", result.Cutoff)
	writeJSON(w, http.StatusOK, result)
}

func authorized(r *http.Request, expected string) bool {
	provided := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	return provided != "" && strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") && subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
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

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
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
	u.RawQuery = query.Encode()
	return u.String(), nil
}
