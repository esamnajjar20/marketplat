package main

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"marketplat/apps/go-worker/internal/activitybuffer"
	"marketplat/apps/go-worker/internal/adexpiry"
	"marketplat/apps/go-worker/internal/mediacleanup"
	"marketplat/apps/go-worker/internal/promotionlifecycle"
	"marketplat/apps/go-worker/internal/rediswire"
	"marketplat/apps/go-worker/internal/requestexpiry"
	"marketplat/apps/go-worker/internal/salesjobs"
	"marketplat/apps/go-worker/internal/sellerresponse"
	"marketplat/apps/go-worker/internal/serviceexpiry"
	"marketplat/apps/go-worker/internal/storycleanup"
	"marketplat/apps/go-worker/internal/viewsbuffer"
	"marketplat/apps/go-worker/internal/weeklyreports"
)

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
		redisConn, err := s.redisPool.Acquire(ctx)
		if err != nil {
			return nil, err
		}
		result, flushErr := activitybuffer.Flush(ctx, conn, redisConn)
		s.redisPool.Release(redisConn, flushErr == nil)
		return result, flushErr
	})
}

func (s *server) runViewsBufferFlush(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJob(w, r, viewsBufferLockID, "views buffer flush", func(ctx context.Context, conn *sql.Conn) (any, error) {
		redisConn, err := s.redisPool.Acquire(ctx)
		if err != nil {
			return nil, err
		}
		result, flushErr := viewsbuffer.Flush(ctx, conn, redisConn)
		s.redisPool.Release(redisConn, flushErr == nil)
		return result, flushErr
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
		writeError(w, http.StatusUnauthorized, "unauthorized")
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

func (s *server) runCleanupMediaAssets(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if s.db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database is not configured on Go worker"})
		return
	}
	if s.cloudinary == nil || !s.cloudinary.Configured() {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "Cloudinary credentials are not configured on Go worker"})
		return
	}
	s.runLockedSQLJobWithTimeout(w, r, mediaCleanupLockID, "cleanup queued Cloudinary media", 8*time.Minute, func(ctx context.Context, conn *sql.Conn) (any, error) {
		return mediacleanup.Run(ctx, conn, s.cloudinary, mediacleanup.DefaultBatchSize, time.Now().UTC())
	})
}

func (s *server) mediaCleanupStatus(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	if s.db == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "database is not configured on Go worker"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	var pending, processing, dead int64
	var oldestPending sql.NullTime
	err := s.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FILTER (WHERE "status" = 'PENDING'),
		       COUNT(*) FILTER (WHERE "status" = 'PROCESSING'),
		       COUNT(*) FILTER (WHERE "status" = 'DEAD'),
		       MIN("createdAt") FILTER (WHERE "status" = 'PENDING')
		FROM "media_cleanup_jobs"
	`).Scan(&pending, &processing, &dead, &oldestPending)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "media cleanup status unavailable"})
		return
	}
	var oldest *string
	if oldestPending.Valid {
		value := oldestPending.Time.UTC().Format(time.RFC3339Nano)
		oldest = &value
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"status": "ok", "pending": pending, "processing": processing,
		"deadLettered": dead, "oldestPendingCreatedAt": oldest,
		"cloudinaryConfigured": s.cloudinary != nil && s.cloudinary.Configured(),
	})
}
