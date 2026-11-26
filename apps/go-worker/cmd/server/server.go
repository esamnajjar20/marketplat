package main

import (
	"database/sql"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"time"

	"marketplat/apps/go-worker/internal/fcmpush"
	"marketplat/apps/go-worker/internal/loadtracker"
	"marketplat/apps/go-worker/internal/rediswire"
	"marketplat/apps/go-worker/internal/storycleanup"
)

type server struct {
	db                  *sql.DB
	load                *loadtracker.Tracker
	redisConfig         *rediswire.Config
	redisPool           *rediswire.Pool
	cacheRedisConfig    *rediswire.Config
	cacheRedisPool      *rediswire.Pool
	token               string
	apiBaseURL          string
	outboxEnabled       bool
	outboxWorkerActive  atomic.Bool
	pushDispatchEnabled bool
	searchIndexEnabled  bool
	pushDispatchActive  atomic.Bool
	retentionDays       int
	batchSize           int
	logger              *slog.Logger
	cloudinary          *storycleanup.Client
	fcmPush             *fcmpush.Client
	jobGates            sync.Map // map[int64]*sync.Mutex; process-local fast gate before the DB advisory lock.
}

func newServer(cfg config, db *sql.DB, logger *slog.Logger) *server {
	primaryRedisPool := rediswire.NewPool(cfg.Redis, 2)
	cacheRedisPool := primaryRedisPool
	if !sameRedisConfig(cfg.Redis, cfg.CacheRedis) {
		// Cache-generation bumps are serial in the Outbox worker. A dedicated
		// cache endpoint therefore needs only one connection; when both roles
		// use the same Redis service, reuse the primary pool instead of opening
		// a second pair of TLS/AUTH connections to the same instance.
		cacheRedisPool = rediswire.NewPool(cfg.CacheRedis, 1)
	}
	return &server{
		db:                  db,
		load:                loadtracker.New(),
		redisConfig:         cfg.Redis,
		redisPool:           primaryRedisPool,
		cacheRedisConfig:    cfg.CacheRedis,
		cacheRedisPool:      cacheRedisPool,
		token:               cfg.Token,
		apiBaseURL:          cfg.APIBaseURL,
		outboxEnabled:       cfg.OutboxEnabled,
		pushDispatchEnabled: cfg.PushDispatchEnabled,
		searchIndexEnabled:  cfg.SearchIndexEnabled,
		retentionDays:       cfg.RetentionDays,
		batchSize:           cfg.BatchSize,
		logger:              logger,
		cloudinary: storycleanup.NewClient(
			os.Getenv("CLOUDINARY_CLOUD_NAME"),
			os.Getenv("CLOUDINARY_API_KEY"),
			os.Getenv("CLOUDINARY_API_SECRET"),
		),
		fcmPush: fcmpush.NewFromEnv(),
	}
}

// handler is the full production handler chain: security headers, request
// load tracking, then the route table.
func (s *server) handler() http.Handler {
	return securityHeaders(s.load.Middleware(s.routes()))
}

func (s *server) newHTTPServer(addr string) *http.Server {
	return &http.Server{
		Addr:              addr,
		Handler:           s.handler(),
		ReadHeaderTimeout: 3 * time.Second,
		ReadTimeout:       5 * time.Second,
		WriteTimeout:      10 * time.Minute,
		IdleTimeout:       60 * time.Second,
	}
}

// routes is the single source of truth for the worker's HTTP surface; tests
// build their handler from it so the route table cannot drift.
func (s *server) routes() *http.ServeMux {
	mux := http.NewServeMux()

	// Health and diagnostics.
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /internal/diagnostics", s.internalDiagnostics)

	// Monitors and integrity scans.
	mux.HandleFunc("POST /internal/integrity/scan", s.runDataIntegrityScan)
	mux.HandleFunc("POST /internal/fraud/monitor/scan", s.runFraudMonitorScan)
	mux.HandleFunc("POST /internal/inventory/store-summary", s.getInventoryStoreSummary)
	mux.HandleFunc("POST /internal/jobs/inventory-monitor", s.runInventoryMonitor)

	// Analytics.
	mux.HandleFunc("POST /internal/analytics/events", s.ingestAnalyticsEvents)
	mux.HandleFunc("POST /internal/analytics/summary", s.getAnalyticsSummary)
	mux.HandleFunc("POST /internal/jobs/analytics-rollup", s.runAnalyticsRollup)
	mux.HandleFunc("POST /internal/jobs/analytics-retention", s.runAnalyticsRetention)

	// Search index.
	mux.HandleFunc("POST /internal/jobs/search-index-refresh", s.runSearchIndexRefresh)
	mux.HandleFunc("GET /internal/search/index-status", s.searchIndexStatus)

	// Retention and digests.
	mux.HandleFunc("POST /internal/jobs/auth-token-retention", s.runAuthTokenRetention)
	mux.HandleFunc("POST /internal/jobs/notification-retention", s.runNotificationRetention)
	mux.HandleFunc("POST /internal/jobs/failed-task-retention", s.runFailedTaskRetention)
	mux.HandleFunc("POST /internal/jobs/notification-digest", s.runNotificationDigest)

	// Exports and reports.
	mux.HandleFunc("GET /internal/exports/users.csv", s.exportUsersCSV)
	mux.HandleFunc("GET /internal/exports/reports.csv", s.exportReportsCSV)
	mux.HandleFunc("POST /internal/exports/sales.csv", s.exportSalesCSV)
	mux.HandleFunc("POST /internal/reports/sales-insights", s.getSalesInsights)

	// Scheduled maintenance jobs.
	mux.HandleFunc("POST /internal/jobs/weekly-ad-views", s.runWeeklyAdViews)
	mux.HandleFunc("POST /internal/jobs/weekly-store-views", s.runWeeklyStoreViews)
	mux.HandleFunc("POST /internal/jobs/weekly-service-views", s.runWeeklyServiceViews)
	mux.HandleFunc("POST /internal/jobs/seller-response-metrics", s.runSellerResponseMetrics)
	mux.HandleFunc("POST /internal/jobs/sales-daily-reminder", s.runSalesDailyReminder)
	mux.HandleFunc("POST /internal/jobs/sales-debt-reminder", s.runSalesDebtReminder)
	mux.HandleFunc("POST /internal/jobs/sales-overdue-installments", s.runSalesOverdueInstallments)
	mux.HandleFunc("POST /internal/jobs/weekly-sales-report", s.runWeeklySalesReport)
	mux.HandleFunc("POST /internal/jobs/activity-buffer-flush", s.runActivityBufferFlush)
	mux.HandleFunc("POST /internal/jobs/views-buffer-flush", s.runViewsBufferFlush)
	mux.HandleFunc("POST /internal/jobs/expire-open-requests", s.runExpireOpenRequests)
	mux.HandleFunc("POST /internal/jobs/demote-stale-boosts", s.runDemoteStaleBoosts)
	mux.HandleFunc("POST /internal/jobs/expire-service-requests", s.runExpireServiceRequests)
	mux.HandleFunc("POST /internal/jobs/expire-ads", s.runExpireAds)
	mux.HandleFunc("POST /internal/jobs/promotion-lifecycle", s.runPromotionLifecycle)

	// Media.
	mux.HandleFunc("POST /internal/jobs/cleanup-expired-stories", s.runCleanupExpiredStories)
	mux.HandleFunc("POST /internal/jobs/cleanup-media-assets", s.runCleanupMediaAssets)
	mux.HandleFunc("GET /internal/media/cleanup/status", s.mediaCleanupStatus)

	// Outbox, scheduler and push.
	mux.HandleFunc("POST /internal/outbox/execute-event", s.executeOutboxEvent)
	mux.HandleFunc("GET /internal/outbox/worker-status", s.outboxWorkerStatus)
	mux.HandleFunc("POST /internal/scheduler/run-due", s.runDueScheduledJobs)
	mux.HandleFunc("POST /internal/push/fcm/send", s.sendFcmPush)
	mux.HandleFunc("GET /internal/push/dispatch/worker-status", s.pushDispatchWorkerStatus)

	return mux
}
