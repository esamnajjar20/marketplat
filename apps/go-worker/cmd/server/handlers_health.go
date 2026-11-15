package main

import (
	"context"
	"database/sql"
	"net/http"
	"sync"
	"time"

	"marketplat/apps/go-worker/internal/rediswire"
)

const (
	serviceName         = "marketplat-go-worker"
	dependencyProbeTime = 1500 * time.Millisecond
)

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	// A single-connection Aiven pool may have its only connection checked out
	// by a long-running job. Do not make the platform restart a healthy worker
	// merely because the DB connection is busy; the job itself owns and checks
	// that connection. Probe PostgreSQL whenever a spare connection is available.
	stats := s.db.Stats()
	if stats.MaxOpenConnections > 0 && stats.InUse >= stats.MaxOpenConnections {
		writeJSON(w, http.StatusOK, map[string]string{"status": "busy", "service": serviceName})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.PingContext(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unhealthy"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": serviceName})
}

// databaseReadiness reports which migrations/tables each worker feature needs.
type databaseReadiness struct {
	database              string
	viewBatchLedger       string
	schedulerLedger       string
	analyticsRollups      string
	searchSuggestionIndex string
	inventoryMonitoring   string
	fraudMonitoring       string
	mediaCleanupQueue     string
}

func readyOrMissing(ok bool) string {
	if ok {
		return "ready"
	}
	return "missing"
}

// probeDatabaseReadiness checks, in one catalogue query, that the tables and
// indexes each feature relies on exist. Without a database every field keeps
// its "unhealthy"/"unknown" default.
func (s *server) probeDatabaseReadiness(parent context.Context) databaseReadiness {
	result := databaseReadiness{
		database: "unhealthy", viewBatchLedger: "unknown", schedulerLedger: "unknown",
		analyticsRollups: "unknown", searchSuggestionIndex: "unknown", inventoryMonitoring: "unknown",
		fraudMonitoring: "unknown", mediaCleanupQueue: "unknown",
	}
	if s.db == nil {
		return result
	}
	ctx, cancel := context.WithTimeout(parent, dependencyProbeTime)
	defer cancel()

	var viewBatchLedger, schedulerLedger, rollupTable, rollupDays, searchView, searchState bool
	var productsTable, storesTable, sellerProfilesTable, usersTable, stockMovementsTable, salesEventsTable, notificationsTable, pushDispatchesTable, mediaCleanupTable, reportsTable, fraudSignalsTable, fraudReportIndex, fraudHistoryRuns, fraudHistoryChecks bool
	err := s.db.QueryRowContext(ctx, `
		SELECT to_regclass('view_buffer_flush_batches') IS NOT NULL,
		       to_regclass('scheduled_job_runs') IS NOT NULL,
		       to_regclass('analytics_event_daily_rollups') IS NOT NULL,
		       to_regclass('analytics_rollup_days') IS NOT NULL,
		       to_regclass('search_suggestions_mv') IS NOT NULL,
		       to_regclass('search_suggestion_index_state') IS NOT NULL,
		       to_regclass('products') IS NOT NULL,
		       to_regclass('store_details') IS NOT NULL,
		       to_regclass('seller_profiles') IS NOT NULL,
		       to_regclass('users') IS NOT NULL,
		       to_regclass('stock_movements') IS NOT NULL,
		       to_regclass('sales_automation_events') IS NOT NULL,
		       to_regclass('notifications') IS NOT NULL,
		       to_regclass('notification_push_dispatches') IS NOT NULL,
		       to_regclass('media_cleanup_jobs') IS NOT NULL,
		       to_regclass('reports') IS NOT NULL,
		       to_regclass('fraud_signals') IS NOT NULL,
		       EXISTS (SELECT 1 FROM pg_index WHERE indexrelid = to_regclass('reports_status_created_at_idx') AND indisvalid),
		       to_regclass('fraud_monitor_scan_runs') IS NOT NULL,
		       to_regclass('fraud_monitor_check_snapshots') IS NOT NULL
	`).Scan(&viewBatchLedger, &schedulerLedger, &rollupTable, &rollupDays, &searchView, &searchState,
		&productsTable, &storesTable, &sellerProfilesTable, &usersTable, &stockMovementsTable, &salesEventsTable, &notificationsTable, &pushDispatchesTable, &mediaCleanupTable, &reportsTable, &fraudSignalsTable, &fraudReportIndex, &fraudHistoryRuns, &fraudHistoryChecks)
	if err != nil {
		return result
	}

	result.database = "ok"
	result.inventoryMonitoring = readyOrMissing(productsTable && storesTable && sellerProfilesTable && usersTable && stockMovementsTable && salesEventsTable && notificationsTable && pushDispatchesTable)
	result.viewBatchLedger = readyOrMissing(viewBatchLedger)
	result.schedulerLedger = readyOrMissing(schedulerLedger)
	result.fraudMonitoring = readyOrMissing(reportsTable && fraudSignalsTable && usersTable && fraudReportIndex && fraudHistoryRuns && fraudHistoryChecks)
	result.mediaCleanupQueue = readyOrMissing(mediaCleanupTable)
	result.analyticsRollups = readyOrMissing(rollupTable && rollupDays)
	if !searchView || !searchState {
		result.searchSuggestionIndex = "missing"
		return result
	}

	var fresh bool
	statusErr := s.db.QueryRowContext(ctx, `
		SELECT "refreshedAt" IS NOT NULL
		  AND "refreshedAt" >= NOW() - INTERVAL '30 minutes'
		  AND "refreshedAt" <= NOW()
		FROM "search_suggestion_index_state" WHERE "singletonId" = 1
	`).Scan(&fresh)
	switch {
	case statusErr != nil:
		result.searchSuggestionIndex = "unknown"
	case fresh:
		result.searchSuggestionIndex = "fresh"
	default:
		result.searchSuggestionIndex = "stale"
	}
	return result
}

// internalDiagnostics is protected by the worker token and reports dependency
// readiness without exposing connection strings, Redis hosts, tokens, or keys.
// The public /healthz endpoint intentionally remains DB-focused so an optional
// Redis outage does not cause Render to restart a worker that can still serve
// database-only maintenance jobs and Express fallbacks.
func (s *server) internalDiagnostics(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	// Probe independent dependencies concurrently. Each probe gets its own
	// deadline, so sequential 1.5s probes cannot exhaust a shared 2s request
	// budget and misreport a reachable Redis as unhealthy.
	var (
		dbStatus     databaseReadiness
		redisStatus  string
		cacheStatus  = "same_as_primary"
		probes       sync.WaitGroup
		cacheDiffers = !sameRedisConfig(s.redisConfig, s.cacheRedisConfig)
	)
	probes.Add(2)
	go func() {
		defer probes.Done()
		dbStatus = s.probeDatabaseReadiness(r.Context())
	}()
	go func() {
		defer probes.Done()
		redisStatus = probeRedis(r.Context(), s.redisConfig)
	}()
	if cacheDiffers {
		probes.Add(1)
		go func() {
			defer probes.Done()
			cacheStatus = probeRedis(r.Context(), s.cacheRedisConfig)
		}()
	}
	probes.Wait()

	cacheRedisStatus := cacheStatus
	if cacheRedisStatus == "same_as_primary" {
		cacheRedisStatus = redisStatus
	}
	fcmStatus := "missing"
	if s.fcmPush != nil {
		fcmStatus = s.fcmPush.ConfigurationStatus()
	}

	status := "ok"
	if dbStatus.database != "ok" || dbStatus.viewBatchLedger != "ready" || dbStatus.schedulerLedger != "ready" ||
		dbStatus.analyticsRollups != "ready" || dbStatus.inventoryMonitoring != "ready" ||
		dbStatus.fraudMonitoring != "ready" || dbStatus.mediaCleanupQueue != "ready" ||
		redisStatus != "ok" || cacheRedisStatus != "ok" {
		status = "degraded"
	}
	poolStats := sql.DBStats{}
	if s.db != nil {
		poolStats = s.db.Stats()
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  status,
		"service": serviceName,
		"dependencies": map[string]string{
			"postgres":              dbStatus.database,
			"redis":                 redisStatus,
			"cacheRedis":            cacheRedisStatus,
			"viewBatchLedger":       dbStatus.viewBatchLedger,
			"schedulerLedger":       dbStatus.schedulerLedger,
			"analyticsRollups":      dbStatus.analyticsRollups,
			"searchSuggestionIndex": dbStatus.searchSuggestionIndex,
			"inventoryMonitoring":   dbStatus.inventoryMonitoring,
			"fraudMonitoring":       dbStatus.fraudMonitoring,
			"mediaCleanupQueue":     dbStatus.mediaCleanupQueue,
			"firebaseCredentials":   fcmStatus,
		},
		"databasePool": map[string]any{
			"openConnections":    poolStats.OpenConnections,
			"inUse":              poolStats.InUse,
			"idle":               poolStats.Idle,
			"maxOpenConnections": poolStats.MaxOpenConnections,
		},
	})
}

func sameRedisConfig(left, right *rediswire.Config) bool {
	if left == nil || right == nil {
		return left == right
	}
	return left.Addr == right.Addr && left.Username == right.Username &&
		left.Password == right.Password && left.TLS == right.TLS && left.DB == right.DB
}

func probeRedis(parent context.Context, config *rediswire.Config) string {
	if config == nil {
		return "not_configured"
	}
	ctx, cancel := context.WithTimeout(parent, dependencyProbeTime)
	defer cancel()
	conn, err := rediswire.Dial(ctx, config)
	if err != nil {
		return "unhealthy"
	}
	defer conn.Close()
	response, err := conn.Do(ctx, "PING")
	if err != nil || response != "PONG" {
		return "unhealthy"
	}
	return "ok"
}
