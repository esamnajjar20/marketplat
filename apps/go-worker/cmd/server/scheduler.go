package main

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"marketplat/apps/go-worker/internal/analyticsrollup"
	"marketplat/apps/go-worker/internal/inventorymonitor"
	"marketplat/apps/go-worker/internal/scheduler"
)

const (
	scheduledJobStaleAfter = 75 * time.Minute
	scheduledJobTimeout    = 40 * time.Minute
	schedulerRunTimeout    = 44 * time.Minute
)

type scheduledJobResult struct {
	JobName      string `json:"jobName"`
	ScheduledFor string `json:"scheduledFor"`
	Status       string `json:"status"`
	Error        string `json:"error,omitempty"`
}

type scheduledJobsResponse struct {
	TimeZone  string               `json:"timeZone"`
	Due       int                  `json:"due"`
	Completed int                  `json:"completed"`
	Skipped   int                  `json:"skipped"`
	Failed    int                  `json:"failed"`
	Jobs      []scheduledJobResult `json:"jobs"`
}

// runDueScheduledJobs is the primary scheduler entrypoint. Go owns due-date
// calculation, the durable execution ledger, retries/catch-up, and ordering.
// Express remains the execution adapter so each existing script keeps its
// Go-first database path, Express fallback, and post-commit side effects.
func (s *server) runDueScheduledJobs(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if !requireEmptyJSONObject(w, r, 2*1024) {
		return
	}

	apiBaseURL, err := normalizeAPIBaseURL(s.apiBaseURL)
	if err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "GO_WORKER_API_URL is not configured correctly"})
		return
	}
	location, err := time.LoadLocation(scheduler.TimeZone)
	if err != nil {
		s.logger.Error("load scheduled-job business timezone", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "scheduler timezone is unavailable"})
		return
	}

	// The default server write deadline is 10 minutes for ordinary requests.
	// This one internal endpoint may run a sequence of bounded jobs, so extend
	// only its response deadline; the request context still cancels all work
	// when the authenticated caller disconnects or reaches its own timeout.
	if controller := http.NewResponseController(w); controller != nil {
		if err := controller.SetWriteDeadline(time.Now().Add(schedulerRunTimeout)); err != nil {
			s.logger.Warn("could not extend scheduled-job response deadline", "error", err)
		}
	}

	var tableExists bool
	checkCtx, checkCancel := context.WithTimeout(r.Context(), 5*time.Second)
	err = s.db.QueryRowContext(checkCtx, `SELECT to_regclass('scheduled_job_runs') IS NOT NULL`).Scan(&tableExists)
	checkCancel()
	if err != nil || !tableExists {
		s.logger.Error("scheduled-job ledger is unavailable", "error", err, "tableExists", tableExists)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "scheduled_job_runs migration is not applied"})
		return
	}

	dueJobs := scheduler.DueJobs(time.Now(), location)
	response := scheduledJobsResponse{
		TimeZone: scheduler.TimeZone,
		Due:      len(dueJobs),
		Jobs:     make([]scheduledJobResult, 0, len(dueJobs)),
	}

	for _, due := range dueJobs {
		if r.Context().Err() != nil {
			break
		}
		jobName := due.Definition.Name
		claimCtx, claimCancel := context.WithTimeout(r.Context(), 5*time.Second)
		claimed, claimErr := s.claimScheduledJob(claimCtx, jobName, due.ScheduledFor)
		claimCancel()
		if claimErr != nil {
			response.Failed++
			response.Jobs = append(response.Jobs, scheduledJobResult{
				JobName: jobName, ScheduledFor: due.ScheduledFor, Status: "claim-failed",
				Error: "could not claim scheduled job",
			})
			s.logger.Error("Go scheduler could not claim job", "jobName", jobName, "scheduledFor", due.ScheduledFor, "error", claimErr)
			continue
		}
		if !claimed {
			response.Skipped++
			response.Jobs = append(response.Jobs, scheduledJobResult{
				JobName: jobName, ScheduledFor: due.ScheduledFor, Status: "already-owned-or-completed",
			})
			continue
		}

		jobCtx, jobCancel := context.WithTimeout(r.Context(), scheduledJobTimeout)
		jobErr := s.invokeScheduledJob(jobCtx, apiBaseURL, jobName, due.ScheduledFor)
		jobCancel()
		if jobErr != nil {
			message := boundedJobError(jobErr)
			markCtx, markCancel := context.WithTimeout(context.Background(), 5*time.Second)
			markErr := s.markScheduledJobFailed(markCtx, jobName, due.ScheduledFor, message)
			markCancel()
			if markErr != nil {
				s.logger.Error("Go scheduler could not persist failed job state", "jobName", jobName, "scheduledFor", due.ScheduledFor, "error", markErr)
			}
			response.Failed++
			response.Jobs = append(response.Jobs, scheduledJobResult{
				JobName: jobName, ScheduledFor: due.ScheduledFor, Status: "failed", Error: message,
			})
			s.logger.Error("Go scheduled job failed", "jobName", jobName, "scheduledFor", due.ScheduledFor, "error", jobErr)
			if r.Context().Err() != nil {
				break
			}
			continue
		}

		markCtx, markCancel := context.WithTimeout(context.Background(), 5*time.Second)
		markErr := s.markScheduledJobCompleted(markCtx, jobName, due.ScheduledFor)
		markCancel()
		if markErr != nil {
			// The child completed. Leave the ledger RUNNING rather than mark a
			// successful job FAILED; the 75-minute reclaim window is the safe
			// recovery path if the completion write could not be confirmed.
			response.Failed++
			response.Jobs = append(response.Jobs, scheduledJobResult{
				JobName: jobName, ScheduledFor: due.ScheduledFor, Status: "completion-unconfirmed",
				Error: "job completed but scheduler ledger update failed",
			})
			s.logger.Error("Go scheduler could not confirm job completion", "jobName", jobName, "scheduledFor", due.ScheduledFor, "error", markErr)
			continue
		}
		response.Completed++
		response.Jobs = append(response.Jobs, scheduledJobResult{
			JobName: jobName, ScheduledFor: due.ScheduledFor, Status: "completed",
		})
	}

	status := http.StatusOK
	if response.Failed > 0 {
		status = http.StatusBadGateway
	}
	writeJSON(w, status, response)
}

func requireEmptyJSONObject(w http.ResponseWriter, r *http.Request, maxBytes int64) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBytes))
	decoder.DisallowUnknownFields()
	var body map[string]json.RawMessage
	if err := decoder.Decode(&body); err != nil || body == nil || len(body) != 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must be an empty JSON object"})
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must contain one JSON object"})
		return false
	}
	return true
}

func normalizeAPIBaseURL(raw string) (string, error) {
	raw = strings.TrimSpace(strings.TrimRight(raw, "/"))
	if raw == "" {
		return "", errors.New("API base URL is empty")
	}
	parsed, err := url.Parse(raw)
	if err != nil || parsed.Hostname() == "" || (parsed.Scheme != "https" && parsed.Scheme != "http") ||
		parsed.User != nil || parsed.RawQuery != "" || parsed.Fragment != "" || (parsed.Path != "" && parsed.Path != "/") {
		return "", errors.New("API base URL must be an http(s) origin without credentials, path, query, or fragment")
	}
	if parsed.Scheme == "http" && parsed.Hostname() != "localhost" && parsed.Hostname() != "127.0.0.1" {
		return "", errors.New("non-local API base URL must use HTTPS")
	}
	return parsed.Scheme + "://" + parsed.Host, nil
}

func (s *server) claimScheduledJob(ctx context.Context, name, dateKey string) (bool, error) {
	var claimedName string
	err := s.db.QueryRowContext(ctx, `
		INSERT INTO "scheduled_job_runs" ("jobName", "scheduledFor", "status", "attempts", "startedAt")
		VALUES ($1, $2, 'RUNNING', 1, NOW())
		ON CONFLICT ("jobName", "scheduledFor") DO UPDATE
		  SET "status" = 'RUNNING',
		      "attempts" = "scheduled_job_runs"."attempts" + 1,
		      "startedAt" = NOW(),
		      "completedAt" = NULL,
		      "lastError" = NULL
		WHERE "scheduled_job_runs"."status" <> 'COMPLETED'
		  AND (
		    "scheduled_job_runs"."status" <> 'RUNNING'
		    OR "scheduled_job_runs"."startedAt" < NOW() - ($3 * INTERVAL '1 minute')
		  )
		RETURNING "jobName"
	`, name, dateKey, int(scheduledJobStaleAfter/time.Minute)).Scan(&claimedName)
	if errors.Is(err, sql.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("claim scheduled job: %w", err)
	}
	return claimedName == name, nil
}

func (s *server) markScheduledJobCompleted(ctx context.Context, name, dateKey string) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE "scheduled_job_runs"
		SET "status" = 'COMPLETED', "completedAt" = NOW(), "lastError" = NULL
		WHERE "jobName" = $1 AND "scheduledFor" = $2 AND "status" = 'RUNNING'
	`, name, dateKey)
	if err != nil {
		return fmt.Errorf("mark scheduled job completed: %w", err)
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		return errors.New("scheduled job ledger row is no longer RUNNING")
	}
	return nil
}

func (s *server) markScheduledJobFailed(ctx context.Context, name, dateKey, message string) error {
	result, err := s.db.ExecContext(ctx, `
		UPDATE "scheduled_job_runs"
		SET "status" = 'FAILED', "lastError" = $3
		WHERE "jobName" = $1 AND "scheduledFor" = $2 AND "status" = 'RUNNING'
	`, name, dateKey, message)
	if err != nil {
		return fmt.Errorf("mark scheduled job failed: %w", err)
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("inspect failed scheduled job update: %w", err)
	}
	if changed != 1 {
		return errors.New("scheduled job ledger row is no longer RUNNING")
	}
	return nil
}

func (s *server) invokeScheduledJob(ctx context.Context, apiBaseURL, name, dateKey string) error {
	if name == "report:analytics-rollup" {
		result, err := analyticsrollup.Run(ctx, s.db, time.Now().UTC(), s.analyticsRollupConfig())
		if err != nil {
			return err
		}
		s.logger.Info("Go scheduled analytics rollup completed",
			"scheduledFor", dateKey,
			"plannedDays", result.PlannedDays,
			"rebuiltDays", result.RebuiltDays,
			"skippedDays", result.SkippedDays,
			"sourceEvents", result.SourceEvents,
			"rollupRows", result.RollupRows,
			"prunedDays", result.PrunedDays,
			"prunedRows", result.PrunedRows,
		)
		return nil
	}
	if name == "report:inventory-monitor" {
		result, err := inventorymonitor.RunLowStockAlerts(ctx, s.db)
		if err != nil {
			return err
		}
		if !result.LockAcquired {
			s.logger.Info("Go inventory monitor skipped; another runner owns its advisory lock", "scheduledFor", dateKey)
			return nil
		}
		s.logger.Info("Go scheduled inventory monitor completed",
			"scheduledFor", dateKey,
			"candidatesScanned", result.CandidatesScanned,
			"eventsClaimed", result.EventsClaimed,
			"notificationsCreated", result.NotificationsCreated,
			"pushDispatchesCreated", result.PushDispatchesCreated,
		)
		if len(result.NotificationIDs) > 0 {
			publishCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
			if publishErr := s.publishInventoryNotifications(publishCtx, apiBaseURL, result.NotificationIDs); publishErr != nil {
				s.logger.Warn("inventory alerts committed but live notification fan-out failed", "error", publishErr, "notifications", len(result.NotificationIDs))
			}
			cancel()
		}
		return nil
	}
	return s.invokeAPIScheduledJob(ctx, apiBaseURL, name, dateKey)
}

func (s *server) invokeAPIScheduledJob(ctx context.Context, apiBaseURL, name, dateKey string) error {
	body, err := json.Marshal(map[string]string{"jobName": name, "scheduledFor": dateKey})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiBaseURL+"/internal/go-worker/run-scheduled-job", bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("create API job request: %w", err)
	}
	req.Header.Set("Authorization", "Bearer "+s.token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")

	client := &http.Client{
		Timeout: scheduledJobTimeout,
		CheckRedirect: func(_ *http.Request, _ []*http.Request) error {
			return http.ErrUseLastResponse
		},
	}
	response, err := client.Do(req)
	if err != nil {
		return fmt.Errorf("API execution adapter unavailable: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4*1024))
		return fmt.Errorf("API execution adapter returned HTTP %d", response.StatusCode)
	}
	_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 4*1024))
	return nil
}

func boundedJobError(err error) string {
	message := strings.TrimSpace(err.Error())
	if message == "" {
		message = "scheduled job failed"
	}
	if len(message) > 2000 {
		message = message[:2000]
	}
	return message
}
