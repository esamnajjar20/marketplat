package main

import (
	"context"
	"database/sql"
	"net/http"
	"time"

	"marketplat/apps/go-worker/internal/analyticsretention"
	"marketplat/apps/go-worker/internal/authtokenretention"
	"marketplat/apps/go-worker/internal/failedtaskretention"
	"marketplat/apps/go-worker/internal/notificationdigest"
	"marketplat/apps/go-worker/internal/notificationretention"
	"marketplat/apps/go-worker/internal/staleboosts"
)

// runAnalyticsRetention deletes expired analytics events. Express sends its
// configured retention window so both implementations apply the same policy;
// unknown or oversized bodies are rejected rather than silently accepted.
func (s *server) runAnalyticsRetention(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	retentionDays, ok := decodeRetentionDays(w, r, s.retentionDays, maxRetentionDays)
	if !ok {
		return
	}
	s.executeLockedJob(w, r, lockedJob{
		lockID: analyticsRetentionLockID, name: "analytics retention", timeout: maintenanceJobTimeout,
		run: func(ctx context.Context, conn *sql.Conn) (any, error) {
			return analyticsretention.Run(ctx, conn, retentionDays, s.batchSize, time.Now())
		},
	})
}

func (s *server) runNotificationRetention(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	retentionDays, ok := decodeRetentionDays(w, r, notificationretention.DefaultRetentionDays, notificationretention.MaxRetentionDays)
	if !ok {
		return
	}
	s.executeLockedJob(w, r, lockedJob{
		lockID: notificationRetentionLockID, name: "notification retention", timeout: maintenanceJobTimeout,
		run: func(ctx context.Context, conn *sql.Conn) (any, error) {
			return notificationretention.Run(ctx, conn, retentionDays, notificationretention.DefaultBatchSize, time.Now().UTC())
		},
	})
}

func (s *server) runFailedTaskRetention(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	retentionDays, ok := decodeRetentionDays(w, r, failedtaskretention.DefaultRetentionDays, failedtaskretention.MaxRetentionDays)
	if !ok {
		return
	}
	s.executeLockedJob(w, r, lockedJob{
		lockID: failedTaskRetentionLockID, name: "failed task retention", timeout: maintenanceJobTimeout,
		run: func(ctx context.Context, conn *sql.Conn) (any, error) {
			return failedtaskretention.Run(ctx, conn, retentionDays, failedtaskretention.DefaultBatchSize, time.Now().UTC())
		},
	})
}

// runNotificationDigest accepts only an empty object: the digest policy is
// defined in code, not supplied by the caller, so Go and Express cannot drift
// through request input.
func (s *server) runNotificationDigest(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJobWithTimeout(w, r, notificationDigestLockID, "notification digest", maintenanceJobTimeout, func(ctx context.Context, conn *sql.Conn) (any, error) {
		return notificationdigest.Run(ctx, conn, notificationdigest.DefaultBatchSize, time.Now().UTC())
	})
}

// runAuthTokenRetention takes its cutoff from the database-side job time, not
// from caller input; the endpoint accepts an empty JSON object only so it
// cannot acquire a second, divergent policy input.
func (s *server) runAuthTokenRetention(w http.ResponseWriter, r *http.Request) {
	s.runLockedSQLJobWithTimeout(w, r, authTokenRetentionLockID, "auth token retention", maintenanceJobTimeout, func(ctx context.Context, conn *sql.Conn) (any, error) {
		return authtokenretention.Run(ctx, conn, authtokenretention.DefaultBatchSize, time.Now().UTC())
	})
}

func (s *server) runDemoteStaleBoosts(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var request *struct {
		StaleBoostDays *int  `json:"staleBoostDays"`
		DryRun         *bool `json:"dryRun"`
	}
	if !decodeStrictJSON(w, r, 1024, &request, "invalid request body") {
		return
	}
	if request == nil {
		writeError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	staleDays := staleboosts.DefaultStaleDays
	if request.StaleBoostDays != nil {
		staleDays = *request.StaleBoostDays
	}
	if staleDays < 1 || staleDays > staleboosts.MaxStaleDays {
		writeError(w, http.StatusBadRequest, "staleBoostDays must be between 1 and 3650")
		return
	}
	dryRun := request.DryRun != nil && *request.DryRun

	s.executeLockedJob(w, r, lockedJob{
		lockID: staleBoostDemotionLockID, name: "stale boost demotion", timeout: 3 * time.Minute,
		run: func(ctx context.Context, conn *sql.Conn) (any, error) {
			return staleboosts.Run(ctx, conn, staleDays, staleboosts.DefaultBatchSize, dryRun, time.Now().UTC())
		},
	})
}
