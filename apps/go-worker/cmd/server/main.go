package main

import (
	"bufio"
	"context"
	"crypto/subtle"
	"database/sql"
	"database/sql/driver"
	"encoding/json"
	"errors"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	_ "github.com/jackc/pgx/v5/stdlib"
	"marketplat/apps/go-worker/internal/activitybuffer"
	"marketplat/apps/go-worker/internal/adexpiry"
	"marketplat/apps/go-worker/internal/adminexport"
	"marketplat/apps/go-worker/internal/analyticsretention"
	"marketplat/apps/go-worker/internal/authtokenretention"
	"marketplat/apps/go-worker/internal/failedtaskretention"
	"marketplat/apps/go-worker/internal/fcmpush"
	"marketplat/apps/go-worker/internal/notificationdigest"
	"marketplat/apps/go-worker/internal/notificationretention"
	"marketplat/apps/go-worker/internal/promotionlifecycle"
	"marketplat/apps/go-worker/internal/rediswire"
	"marketplat/apps/go-worker/internal/requestexpiry"
	"marketplat/apps/go-worker/internal/salesexport"
	"marketplat/apps/go-worker/internal/salesinsights"
	"marketplat/apps/go-worker/internal/salesjobs"
	"marketplat/apps/go-worker/internal/sellerresponse"
	"marketplat/apps/go-worker/internal/serviceexpiry"
	"marketplat/apps/go-worker/internal/staleboosts"
	"marketplat/apps/go-worker/internal/storycleanup"
	"marketplat/apps/go-worker/internal/viewsbuffer"
	"marketplat/apps/go-worker/internal/weeklyreports"
)

const (
	analyticsRetentionLockID    int64 = 731904281
	authTokenRetentionLockID    int64 = 731904282
	notificationRetentionLockID int64 = 731904283
	failedTaskRetentionLockID   int64 = 731904284
	notificationDigestLockID    int64 = 731904285
	weeklyAdViewsLockID         int64 = 731904286
	weeklyStoreViewsLockID      int64 = 731904287
	weeklyServiceViewsLockID    int64 = 731904288
	sellerResponseMetricsLockID int64 = 731904289
	salesDailyReminderLockID    int64 = 731904290
	salesDebtReminderLockID     int64 = 731904291
	salesInstallmentLockID      int64 = 731904292
	weeklySalesReportLockID     int64 = 731904293
	activityBufferLockID        int64 = 731904294
	viewsBufferLockID           int64 = 731904295
	openRequestExpiryLockID     int64 = 731904296
	staleBoostDemotionLockID    int64 = 731904297
	serviceRequestExpiryLockID  int64 = 731904298
	adExpiryLockID              int64 = 731904299
	storyCleanupLockID          int64 = 731904300
	promotionLifecycleLockID    int64 = 731904301
)

type server struct {
	db               *sql.DB
	redisConfig      *rediswire.Config
	cacheRedisConfig *rediswire.Config
	token            string
	retentionDays    int
	batchSize        int
	logger           *slog.Logger
	cloudinary       *storycleanup.Client
	fcmPush          *fcmpush.Client
	jobGates         sync.Map // map[int64]*sync.Mutex; process-local fast gate before the DB advisory lock.
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
	redisConfig, err := rediswire.ConfigFromEnv()
	if err != nil {
		logger.Error("invalid Redis configuration", "error", err)
		os.Exit(1)
	}
	cacheRedisConfig, err := rediswire.CacheConfigFromEnv(redisConfig)
	if err != nil {
		logger.Error("invalid cache Redis configuration", "error", err)
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

	s := &server{db: db, redisConfig: redisConfig, cacheRedisConfig: cacheRedisConfig, token: token, retentionDays: retentionDays, batchSize: batchSize, logger: logger, cloudinary: storycleanup.NewClient(os.Getenv("CLOUDINARY_CLOUD_NAME"), os.Getenv("CLOUDINARY_API_KEY"), os.Getenv("CLOUDINARY_API_SECRET")), fcmPush: fcmpush.NewFromEnv()}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("POST /internal/jobs/analytics-retention", s.runAnalyticsRetention)
	mux.HandleFunc("POST /internal/jobs/auth-token-retention", s.runAuthTokenRetention)
	mux.HandleFunc("POST /internal/jobs/notification-retention", s.runNotificationRetention)
	mux.HandleFunc("POST /internal/jobs/failed-task-retention", s.runFailedTaskRetention)
	mux.HandleFunc("POST /internal/jobs/notification-digest", s.runNotificationDigest)
	mux.HandleFunc("GET /internal/exports/users.csv", s.exportUsersCSV)
	mux.HandleFunc("GET /internal/exports/reports.csv", s.exportReportsCSV)
	mux.HandleFunc("POST /internal/exports/sales.csv", s.exportSalesCSV)
	mux.HandleFunc("POST /internal/reports/sales-insights", s.getSalesInsights)
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
	mux.HandleFunc("POST /internal/jobs/cleanup-expired-stories", s.runCleanupExpiredStories)
	mux.HandleFunc("POST /internal/outbox/execute-event", s.executeOutboxEvent)
	mux.HandleFunc("POST /internal/push/fcm/send", s.sendFcmPush)

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

type fcmPushRequest struct {
	UserID   string          `json:"userId"`
	TargetID string          `json:"targetId"`
	Payload  fcmpush.Payload `json:"payload"`
}

func (s *server) sendFcmPush(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var request fcmPushRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must contain one JSON object"})
		return
	}
	request.UserID = strings.TrimSpace(request.UserID)
	request.TargetID = strings.TrimSpace(request.TargetID)
	if request.UserID == "" || len(request.UserID) > 128 || request.TargetID == "" || len(request.TargetID) > 128 ||
		strings.TrimSpace(request.Payload.Title) == "" || len(request.Payload.Title) > 256 || len(request.Payload.Body) > 4096 ||
		len(request.Payload.URL) > 2048 || len(request.Payload.Tag) > 256 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid push target or payload"})
		return
	}

	if s.fcmPush == nil || !s.fcmPush.Configured() {
		writeJSON(w, http.StatusOK, map[string]string{"outcome": string(fcmpush.OutcomeUnconfigured)})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 14*time.Second)
	defer cancel()
	var token string
	err := s.db.QueryRowContext(ctx, `
		SELECT "token" FROM "fcm_device_tokens"
		WHERE "id" = $1 AND "userId" = $2
		LIMIT 1
	`, request.TargetID, request.UserID).Scan(&token)
	if errors.Is(err, sql.ErrNoRows) {
		writeJSON(w, http.StatusOK, map[string]string{"outcome": "missing"})
		return
	}
	if err != nil {
		s.logger.Warn("FCM target lookup failed")
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "push target lookup unavailable"})
		return
	}

	outcome := s.fcmPush.Send(ctx, token, request.Payload)
	if outcome == fcmpush.OutcomeGone {
		// Compare the exact token read above so a concurrent token rotation is
		// never deleted because the previous token was reported as UNREGISTERED.
		if _, deleteErr := s.db.ExecContext(ctx, `
			DELETE FROM "fcm_device_tokens"
			WHERE "id" = $1 AND "userId" = $2 AND "token" = $3
		`, request.TargetID, request.UserID, token); deleteErr != nil {
			s.logger.Warn("FCM stale-token prune failed after provider rejection")
		}
	}
	writeJSON(w, http.StatusOK, map[string]string{"outcome": string(outcome)})
}

func (s *server) health(w http.ResponseWriter, r *http.Request) {
	// A single-connection Aiven pool may have its only connection checked out
	// by a long-running job. Do not make the platform restart a healthy worker
	// merely because the DB connection is busy; the job itself owns and checks
	// that connection. Probe PostgreSQL whenever a spare connection is available.
	stats := s.db.Stats()
	if stats.MaxOpenConnections > 0 && stats.InUse >= stats.MaxOpenConnections {
		writeJSON(w, http.StatusOK, map[string]string{
			"status":  "busy",
			"service": "marketplat-go-worker",
		})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	if err := s.db.PingContext(ctx); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unhealthy"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok", "service": "marketplat-go-worker"})
}

// tryLocalJobGate avoids queueing duplicate requests behind a one-connection
// database pool. PostgreSQL advisory locks remain the cross-process authority.
func (s *server) tryLocalJobGate(lockID int64) (release func(), acquired bool) {
	value, _ := s.jobGates.LoadOrStore(lockID, &sync.Mutex{})
	gate := value.(*sync.Mutex)
	if !gate.TryLock() {
		return nil, false
	}
	return gate.Unlock, true
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
	releaseLocalGate, gateAcquired := s.tryLocalJobGate(analyticsRetentionLockID)
	if !gateAcquired {
		writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
		return
	}
	defer releaseLocalGate()

	conn, err := s.db.Conn(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		return
	}
	defer conn.Close()
	var acquired bool
	if err := conn.QueryRowContext(r.Context(), `SELECT pg_try_advisory_lock($1)`, analyticsRetentionLockID).Scan(&acquired); err != nil {
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
		releaseAdvisoryLock(conn, analyticsRetentionLockID, "analytics retention", s.logger)
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

func (s *server) runNotificationRetention(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

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

	retentionDays := notificationretention.DefaultRetentionDays
	if request.RetentionDays != nil {
		retentionDays = *request.RetentionDays
	}
	if retentionDays < 1 || retentionDays > notificationretention.MaxRetentionDays {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "retentionDays must be between 1 and 3650"})
		return
	}

	releaseLocalGate, gateAcquired := s.tryLocalJobGate(notificationRetentionLockID)
	if !gateAcquired {
		writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
		return
	}
	defer releaseLocalGate()

	conn, err := s.db.Conn(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		return
	}
	defer conn.Close()

	var acquired bool
	if err := conn.QueryRowContext(r.Context(), `SELECT pg_try_advisory_lock($1)`, notificationRetentionLockID).Scan(&acquired); err != nil {
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
		releaseAdvisoryLock(conn, notificationRetentionLockID, "notification retention", s.logger)
	}
	defer releaseLock()

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Minute+30*time.Second)
	result, err := notificationretention.Run(
		ctx,
		conn,
		retentionDays,
		notificationretention.DefaultBatchSize,
		time.Now().UTC(),
	)
	cancel()
	releaseLock()
	if err != nil {
		s.logger.Error(
			"notification retention job failed",
			"error", err,
			"deleted", result.Deleted,
			"batches", result.Batches,
		)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "notification retention failed"})
		return
	}

	s.logger.Info(
		"notification retention completed",
		"deleted", result.Deleted,
		"batches", result.Batches,
		"cutoff", result.Cutoff,
		"retentionDays", result.RetentionDays,
	)
	writeJSON(w, http.StatusOK, result)
}

func (s *server) runFailedTaskRetention(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

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

	retentionDays := failedtaskretention.DefaultRetentionDays
	if request.RetentionDays != nil {
		retentionDays = *request.RetentionDays
	}
	if retentionDays < 1 || retentionDays > failedtaskretention.MaxRetentionDays {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "retentionDays must be between 1 and 3650"})
		return
	}

	releaseLocalGate, gateAcquired := s.tryLocalJobGate(failedTaskRetentionLockID)
	if !gateAcquired {
		writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
		return
	}
	defer releaseLocalGate()

	conn, err := s.db.Conn(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		return
	}
	defer conn.Close()

	var acquired bool
	if err := conn.QueryRowContext(r.Context(), `SELECT pg_try_advisory_lock($1)`, failedTaskRetentionLockID).Scan(&acquired); err != nil {
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
		releaseAdvisoryLock(conn, failedTaskRetentionLockID, "failed task retention", s.logger)
	}
	defer releaseLock()

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Minute+30*time.Second)
	result, err := failedtaskretention.Run(
		ctx,
		conn,
		retentionDays,
		failedtaskretention.DefaultBatchSize,
		time.Now().UTC(),
	)
	cancel()
	releaseLock()
	if err != nil {
		s.logger.Error(
			"failed task retention job failed",
			"error", err,
			"deleted", result.Deleted,
			"batches", result.Batches,
		)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "failed task retention failed"})
		return
	}

	s.logger.Info(
		"failed task retention completed",
		"deleted", result.Deleted,
		"batches", result.Batches,
		"cutoff", result.Cutoff,
		"retentionDays", result.RetentionDays,
	)
	writeJSON(w, http.StatusOK, result)
}

func (s *server) runNotificationDigest(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// The digest policy is defined in code, not supplied by the caller. Accept
	// only an empty object so Go and Express cannot drift through request input.
	var request map[string]json.RawMessage
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
	if err := decoder.Decode(&request); err != nil || request == nil || len(request) != 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must be an empty JSON object"})
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must contain one JSON object"})
		return
	}

	releaseLocalGate, gateAcquired := s.tryLocalJobGate(notificationDigestLockID)
	if !gateAcquired {
		writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
		return
	}
	defer releaseLocalGate()

	conn, err := s.db.Conn(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		return
	}
	defer conn.Close()

	var acquired bool
	if err := conn.QueryRowContext(r.Context(), `SELECT pg_try_advisory_lock($1)`, notificationDigestLockID).Scan(&acquired); err != nil {
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
		releaseAdvisoryLock(conn, notificationDigestLockID, "notification digest", s.logger)
	}
	defer releaseLock()

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Minute+30*time.Second)
	result, err := notificationdigest.Run(ctx, conn, notificationdigest.DefaultBatchSize, time.Now().UTC())
	cancel()
	releaseLock()
	if err != nil {
		s.logger.Error(
			"notification digest job failed",
			"error", err,
			"digestsCreated", result.DigestsCreated,
			"rowsMarkedRead", result.RowsMarkedRead,
			"batches", result.Batches,
		)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "notification digest failed"})
		return
	}

	s.logger.Info(
		"notification digest completed",
		"digestsCreated", result.DigestsCreated,
		"rowsMarkedRead", result.RowsMarkedRead,
		"batches", result.Batches,
	)
	writeJSON(w, http.StatusOK, result)
}

func (s *server) runAuthTokenRetention(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	// The token cleanup takes its cutoff from the database-side job time, not
	// from caller input. Accept an empty JSON object only so the endpoint stays
	// strict and cannot accidentally acquire a second, divergent policy input.
	var request map[string]json.RawMessage
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
	if err := decoder.Decode(&request); err != nil || request == nil || len(request) != 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must be an empty JSON object"})
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must contain one JSON object"})
		return
	}

	releaseLocalGate, gateAcquired := s.tryLocalJobGate(authTokenRetentionLockID)
	if !gateAcquired {
		writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
		return
	}
	defer releaseLocalGate()

	conn, err := s.db.Conn(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		return
	}
	defer conn.Close()

	var acquired bool
	if err := conn.QueryRowContext(r.Context(), `SELECT pg_try_advisory_lock($1)`, authTokenRetentionLockID).Scan(&acquired); err != nil {
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
		releaseAdvisoryLock(conn, authTokenRetentionLockID, "auth token retention", s.logger)
	}
	defer releaseLock()

	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Minute+30*time.Second)
	result, err := authtokenretention.Run(ctx, conn, authtokenretention.DefaultBatchSize, time.Now().UTC())
	cancel()
	releaseLock()
	if err != nil {
		s.logger.Error("auth token retention job failed", "error", err, "deleted", result.Deleted, "batches", result.Batches)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "auth token retention failed"})
		return
	}

	s.logger.Info(
		"auth token retention completed",
		"deleted", result.Deleted,
		"batches", result.Batches,
		"passwordResetDeleted", result.PasswordResetDeleted,
		"emailVerificationDeleted", result.EmailVerificationDeleted,
	)
	writeJSON(w, http.StatusOK, result)
}

func (s *server) getSalesInsights(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var request struct {
		UserID string `json:"userId"`
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
	request.UserID = strings.TrimSpace(request.UserID)
	if request.UserID == "" || len(request.UserID) > 128 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "userId is required"})
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	result, err := salesinsights.Run(ctx, s.db, request.UserID, time.Now().UTC())
	if err != nil {
		s.logger.Warn("sales smart insights aggregation failed; Express may fall back", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "sales insights temporarily unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

type csvWriter func(context.Context, io.Writer) error

func (s *server) exportUsersCSV(w http.ResponseWriter, r *http.Request) {
	s.streamCSV(w, r, "users.csv", func(ctx context.Context, dst io.Writer) error {
		return adminexport.WriteUsersCSV(ctx, s.db, dst)
	})
}

func (s *server) exportReportsCSV(w http.ResponseWriter, r *http.Request) {
	s.streamCSV(w, r, "reports.csv", func(ctx context.Context, dst io.Writer) error {
		return adminexport.WriteReportsCSV(ctx, s.db, dst)
	})
}

func (s *server) exportSalesCSV(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var payload struct {
		UserID  string `json:"userId"`
		StoreID string `json:"storeId"`
		Status  string `json:"status"`
		From    string `json:"from"`
		To      string `json:"to"`
		Limit   string `json:"limit"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid sales export request"})
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid sales export request"})
		return
	}
	values := url.Values{
		"userId":  {payload.UserID},
		"storeId": {payload.StoreID},
		"status":  {payload.Status},
		"from":    {payload.From},
		"to":      {payload.To},
		"limit":   {payload.Limit},
	}
	options, err := salesexport.ParseOptions(values)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid sales export parameters"})
		return
	}
	s.streamCSV(w, r, "sales-report.csv", func(ctx context.Context, dst io.Writer) error {
		return salesexport.WriteCSV(ctx, s.db, dst, options)
	})
}

// streamCSV completes the bounded database query into a temporary file
// before sending response headers. This lets Express safely fall back if Go's
// DB query fails, without ever mixing two partial CSV bodies in one response.
func (s *server) streamCSV(w http.ResponseWriter, r *http.Request, filename string, writeCSV csvWriter) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	file, err := os.CreateTemp("", "marketplat-admin-export-*.csv")
	if err != nil {
		s.logger.Error("admin CSV temporary file creation failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "export temporarily unavailable"})
		return
	}
	filePath := file.Name()
	defer os.Remove(filePath)
	defer file.Close()

	ctx, cancel := context.WithTimeout(r.Context(), 13*time.Second)
	defer cancel()
	buffered := bufio.NewWriterSize(file, 32*1024)
	if err := writeCSV(ctx, buffered); err != nil {
		s.logger.Error("admin CSV generation failed", "filename", filename, "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "export temporarily unavailable"})
		return
	}
	if err := buffered.Flush(); err != nil {
		s.logger.Error("admin CSV flush failed", "filename", filename, "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "export temporarily unavailable"})
		return
	}
	if err := file.Sync(); err != nil {
		s.logger.Error("admin CSV sync failed", "filename", filename, "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "export temporarily unavailable"})
		return
	}
	info, err := file.Stat()
	if err != nil {
		s.logger.Error("admin CSV stat failed", "filename", filename, "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "export temporarily unavailable"})
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		s.logger.Error("admin CSV rewind failed", "filename", filename, "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "export temporarily unavailable"})
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, file); err != nil {
		s.logger.Warn("admin CSV stream interrupted", "filename", filename, "error", err)
	}
}

// releaseAdvisoryLock discards the database/sql connection if unlocking
// fails. Returning a session-level advisory lock to the pool would otherwise
// leave that lock attached to an idle pooled connection.
func (s *server) runWeeklyAdViews(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, weeklyAdViewsLockID, "weekly ad views", func(ctx context.Context, conn *sql.Conn) (any, error) {
		return weeklyreports.Run(ctx, conn, weeklyreports.Ads, time.Now())
	})
}

func (s *server) runWeeklyStoreViews(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, weeklyStoreViewsLockID, "weekly store views", func(ctx context.Context, conn *sql.Conn) (any, error) {
		return weeklyreports.Run(ctx, conn, weeklyreports.Stores, time.Now())
	})
}

func (s *server) runWeeklyServiceViews(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, weeklyServiceViewsLockID, "weekly service views", func(ctx context.Context, conn *sql.Conn) (any, error) {
		return weeklyreports.Run(ctx, conn, weeklyreports.Services, time.Now())
	})
}

func (s *server) runSellerResponseMetrics(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, sellerResponseMetricsLockID, "seller response metrics", func(ctx context.Context, conn *sql.Conn) (any, error) {
		return sellerresponse.Run(ctx, conn, time.Now().UTC(), sellerresponse.DefaultWindowDays)
	})
}

func (s *server) runSalesDailyReminder(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, salesDailyReminderLockID, "sales daily reminder", func(ctx context.Context, conn *sql.Conn) (any, error) {
		return salesjobs.Run(ctx, conn, salesjobs.DailyReminder, time.Now())
	})
}

func (s *server) runSalesDebtReminder(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, salesDebtReminderLockID, "sales debt reminder", func(ctx context.Context, conn *sql.Conn) (any, error) {
		return salesjobs.Run(ctx, conn, salesjobs.DebtReminder, time.Now())
	})
}

func (s *server) runSalesOverdueInstallments(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, salesInstallmentLockID, "sales overdue installments", func(ctx context.Context, conn *sql.Conn) (any, error) {
		return salesjobs.Run(ctx, conn, salesjobs.OverdueInstallments, time.Now())
	})
}

func (s *server) runWeeklySalesReport(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, weeklySalesReportLockID, "weekly sales report", func(ctx context.Context, conn *sql.Conn) (any, error) {
		return salesjobs.Run(ctx, conn, salesjobs.WeeklyReport, time.Now())
	})
}

func (s *server) runActivityBufferFlush(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, activityBufferLockID, "activity buffer flush", func(ctx context.Context, conn *sql.Conn) (any, error) {
		redisConn, err := rediswire.Dial(ctx, s.redisConfig)
		if err != nil {
			return nil, err
		}
		defer redisConn.Close()
		return activitybuffer.Flush(ctx, conn, redisConn)
	})
}

func (s *server) runViewsBufferFlush(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, viewsBufferLockID, "views buffer flush", func(ctx context.Context, conn *sql.Conn) (any, error) {
		redisConn, err := rediswire.Dial(ctx, s.redisConfig)
		if err != nil {
			return nil, err
		}
		defer redisConn.Close()
		return viewsbuffer.Flush(ctx, conn, redisConn)
	})
}

func (s *server) runExpireOpenRequests(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, openRequestExpiryLockID, "expire open requests", func(ctx context.Context, conn *sql.Conn) (any, error) {
		return requestexpiry.Run(ctx, conn, requestexpiry.DefaultBatchSize, time.Now().UTC())
	})
}

func (s *server) runExpireAds(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, adExpiryLockID, "expire ads", func(ctx context.Context, conn *sql.Conn) (any, error) {
		return adexpiry.Run(ctx, conn, adexpiry.DefaultBatchSize, time.Now().UTC())
	})
}

func (s *server) runExpireServiceRequests(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, serviceRequestExpiryLockID, "expire stale service requests", func(ctx context.Context, conn *sql.Conn) (any, error) {
		return serviceexpiry.Run(ctx, conn, serviceexpiry.DefaultTTLDays, serviceexpiry.DefaultBatchSize, time.Now().UTC())
	})
}

func (s *server) runPromotionLifecycle(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJobWithTimeout(w, r, promotionLifecycleLockID, "promotion lifecycle", 8*time.Minute, func(ctx context.Context, conn *sql.Conn) (any, error) {
		return promotionlifecycle.Run(ctx, conn, promotionlifecycle.DefaultBatchSize, time.Now().UTC())
	})
}

func (s *server) runCleanupExpiredStories(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if s.cloudinary == nil || !s.cloudinary.Configured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "Cloudinary credentials are not configured on Go worker"})
		return
	}
	s.runLockedSQLJobWithTimeout(w, r, storyCleanupLockID, "cleanup expired stories", 8*time.Minute, func(ctx context.Context, conn *sql.Conn) (any, error) {
		return storycleanup.Run(ctx, conn, s.cloudinary, storycleanup.DefaultBatchSize, time.Now().UTC())
	})
}

func (s *server) runDemoteStaleBoosts(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var request *struct {
		StaleBoostDays *int  `json:"staleBoostDays"`
		DryRun         *bool `json:"dryRun"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil || request == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must contain one JSON object"})
		return
	}
	staleDays := staleboosts.DefaultStaleDays
	if request.StaleBoostDays != nil {
		staleDays = *request.StaleBoostDays
	}
	if staleDays < 1 || staleDays > staleboosts.MaxStaleDays {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "staleBoostDays must be between 1 and 3650"})
		return
	}
	dryRun := false
	if request.DryRun != nil {
		dryRun = *request.DryRun
	}

	releaseLocalGate, gateAcquired := s.tryLocalJobGate(staleBoostDemotionLockID)
	if !gateAcquired {
		writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
		return
	}
	defer releaseLocalGate()

	conn, err := s.db.Conn(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		return
	}
	defer conn.Close()

	var acquired bool
	if err := conn.QueryRowContext(r.Context(), `SELECT pg_try_advisory_lock($1)`, staleBoostDemotionLockID).Scan(&acquired); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "could not acquire job lock"})
		return
	}
	if !acquired {
		writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
		return
	}

	locked := true
	unlock := func() {
		if locked {
			locked = false
			releaseAdvisoryLock(conn, staleBoostDemotionLockID, "stale boost demotion", s.logger)
		}
	}
	defer unlock()

	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Minute)
	result, err := staleboosts.Run(ctx, conn, staleDays, staleboosts.DefaultBatchSize, dryRun, time.Now().UTC())
	cancel()
	unlock()
	if err != nil {
		s.logger.Error("stale boost demotion job failed", "error", err, "updated", result.Updated, "batches", result.Batches)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "stale boost demotion failed"})
		return
	}
	s.logger.Info("stale boost demotion completed", "result", result)
	writeJSON(w, http.StatusOK, result)
}

type lockedJobRunner func(context.Context, *sql.Conn) (any, error)

// runLockedSQLJob is the shared control plane for write-capable scheduled jobs.
// The Go and Express implementations use the same PostgreSQL advisory lock;
// timeout ambiguity therefore cannot start two copies of the same job.
func (s *server) runLockedSQLJob(w http.ResponseWriter, r *http.Request, lockID int64, name string, run lockedJobRunner) {
	s.runLockedSQLJobWithTimeout(w, r, lockID, name, 90*time.Second, run)
}

func (s *server) runLockedSQLJobWithTimeout(w http.ResponseWriter, r *http.Request, lockID int64, name string, timeout time.Duration, run lockedJobRunner) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var body map[string]json.RawMessage
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&body); err != nil || body == nil || len(body) != 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must be an empty JSON object"})
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must contain one JSON object"})
		return
	}

	releaseLocalGate, gateAcquired := s.tryLocalJobGate(lockID)
	if !gateAcquired {
		writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
		return
	}
	defer releaseLocalGate()

	conn, err := s.db.Conn(r.Context())
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database unavailable"})
		return
	}
	defer conn.Close()

	var acquired bool
	if err := conn.QueryRowContext(r.Context(), `SELECT pg_try_advisory_lock($1)`, lockID).Scan(&acquired); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "could not acquire job lock"})
		return
	}
	if !acquired {
		writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
		return
	}
	locked := true
	unlock := func() {
		if locked {
			locked = false
			releaseAdvisoryLock(conn, lockID, name, s.logger)
		}
	}
	defer unlock()

	ctx, cancel := context.WithTimeout(r.Context(), timeout)
	result, err := run(ctx, conn)
	cancel()
	unlock()
	if err != nil {
		s.logger.Error(name+" job failed", "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": name + " failed"})
		return
	}
	s.logger.Info(name+" job completed", "result", result)
	writeJSON(w, http.StatusOK, result)
}

// releaseAdvisoryLock discards the database/sql connection if unlocking fails.
// Returning a session-level advisory lock to the pool would otherwise leave it
// attached to an idle pooled connection.
func releaseAdvisoryLock(conn *sql.Conn, lockID int64, jobName string, logger *slog.Logger) {
	unlockCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	var unlocked bool
	if err := conn.QueryRowContext(unlockCtx, `SELECT pg_advisory_unlock($1)`, lockID).Scan(&unlocked); err != nil || !unlocked {
		logger.Warn(jobName+" advisory lock release failed; discarding database connection", "error", err)
		_ = conn.Raw(func(any) error { return driver.ErrBadConn })
	}
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
