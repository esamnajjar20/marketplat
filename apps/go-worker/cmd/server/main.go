package main

import (
	"context"
	"errors"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata"

	_ "github.com/jackc/pgx/v5/stdlib"
)

const (
	httpShutdownTimeout = 20 * time.Second
	workerStopTimeout   = 15 * time.Second
)

func main() {
	os.Exit(run())
}

// run owns the process lifecycle and returns the exit code, so deferred
// cleanup (closing the database pool) always executes.
func run() int {
	logger := slog.New(slog.NewJSONHandler(os.Stdout, nil))

	cfg, err := loadConfig()
	if err != nil {
		logger.Error("invalid Go worker configuration", "error", err)
		return 1
	}
	db, err := openDatabase(cfg)
	if err != nil {
		logger.Error("database startup failed", "error", err)
		return 1
	}
	defer db.Close()

	s := newServer(cfg, db, logger)
	httpServer := s.newHTTPServer(cfg.Addr)
	logger.Info("MarketPlat Go worker listening", "addr", cfg.Addr, "retentionDays", cfg.RetentionDays, "batchSize", cfg.BatchSize, "outboxEnabled", cfg.OutboxEnabled, "pushDispatchEnabled", cfg.PushDispatchEnabled, "searchIndexEnabled", cfg.SearchIndexEnabled)

	workerCtx, stopWorkers := context.WithCancel(context.Background())
	defer stopWorkers()
	workersDone := s.startBackgroundWorkers(workerCtx)

	// Render sends SIGTERM during deploys. Drain active requests before the
	// process exits so advisory-lock owners can finish or release their locks
	// cleanly; use a hard close only after the bounded shutdown deadline.
	signals := make(chan os.Signal, 1)
	signal.Notify(signals, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(signals)

	serverErr := make(chan error, 1)
	go func() { serverErr <- httpServer.ListenAndServe() }()

	select {
	case sig := <-signals:
		logger.Info("shutdown signal received; draining Go worker", "signal", sig.String())
		stopWorkers()
		// Shutdown blocks until in-flight requests finish, so the process
		// cannot exit while a job still holds its advisory lock.
		shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), httpShutdownTimeout)
		defer shutdownCancel()
		if err := httpServer.Shutdown(shutdownCtx); err != nil {
			logger.Warn("graceful HTTP shutdown timed out; closing active connections", "error", err)
			if closeErr := httpServer.Close(); closeErr != nil {
				logger.Warn("forced HTTP close failed", "error", closeErr)
			}
		}
	case err := <-serverErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			logger.Error("HTTP server failed", "error", err)
			stopWorkers()
			return 1
		}
	}

	stopWorkers()
	select {
	case <-workersDone:
	case <-time.After(workerStopTimeout):
		logger.Warn("timed out waiting for Go background worker shutdown")
	}
	logger.Info("MarketPlat Go worker stopped cleanly")
	return 0
}
