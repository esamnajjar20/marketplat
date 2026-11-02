package outboxworker

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"

	"marketplat/apps/go-worker/internal/outboxevents"
	"marketplat/apps/go-worker/internal/rediswire"
)

const (
	leaseDuration          = 120 * time.Second
	leaseHeartbeatInterval = 30 * time.Second
	processingTimeout      = 90 * time.Second
	maxProcessingAttempts  = 25
	maxBackoff             = time.Hour
	processedRetention     = 30 * 24 * time.Hour
	retentionInterval      = 10 * time.Minute
	retentionBatchSize     = 500
	healthReportInterval   = time.Minute
	staleEventAge          = 5 * time.Minute
	callbackBatchSize      = 50
	callbackMaxPayloadSize = 40 * 1024
)

var idleBackoff = []time.Duration{time.Second, 2 * time.Second, 5 * time.Second, 10 * time.Second}

// EventTypes is deliberately allowlisted. New event types remain available to
// the Express fallback until their Go handler has been implemented and tested.
var EventTypes = []string{
	outboxevents.UserActivityEvent,
	outboxevents.FollowedActivityEvent,
	outboxevents.SavedSearchMatchEvent,
	outboxevents.CacheGenerationBumpEvent,
}

type Config struct {
	APIBaseURL string
	APIToken   string
}

type Worker struct {
	db         *sql.DB
	cacheRedis *rediswire.Config
	logger     *slog.Logger
	apiBaseURL string
	apiToken   string
	httpClient *http.Client
	workerID   string
}

type claimedEvent struct {
	ID        string
	EventType string
	Attempts  int
}

type publishRequest struct {
	EventID       string                      `json:"eventId"`
	Notifications []outboxevents.Notification `json:"notifications"`
}

func New(db *sql.DB, cacheRedis *rediswire.Config, logger *slog.Logger, config Config) *Worker {
	if logger == nil {
		logger = slog.Default()
	}
	return &Worker{
		db:         db,
		cacheRedis: cacheRedis,
		logger:     logger,
		apiBaseURL: strings.TrimRight(strings.TrimSpace(config.APIBaseURL), "/"),
		apiToken:   strings.TrimSpace(config.APIToken),
		httpClient: &http.Client{Timeout: 8 * time.Second},
		workerID:   fmt.Sprintf("go-outbox-%d-%d", os.Getpid(), time.Now().UnixNano()),
	}
}

func (w *Worker) Run(ctx context.Context) error {
	if w.db == nil {
		return errors.New("outbox worker database is required")
	}
	if w.apiBaseURL == "" || w.apiToken == "" {
		return errors.New("outbox worker API callback URL and token are required")
	}
	w.logger.Info("Go transactional outbox worker started", "workerId", w.workerID, "leaseSeconds", int(leaseDuration.Seconds()))
	lastHealthReport, lastRetentionRun := time.Time{}, time.Time{}
	idleStreak := 0
	for ctx.Err() == nil {
		processed, err := w.processOne(ctx)
		if err != nil && ctx.Err() == nil {
			w.logger.Error("Go outbox worker iteration failed", "error", err)
		}
		now := time.Now()
		if lastHealthReport.IsZero() || now.Sub(lastHealthReport) >= healthReportInterval {
			lastHealthReport = now
			if err := w.reportHealth(ctx); err != nil && ctx.Err() == nil {
				w.logger.Error("Go outbox health report failed", "error", err)
			}
		}
		if lastRetentionRun.IsZero() || now.Sub(lastRetentionRun) >= retentionInterval {
			lastRetentionRun = now
			deleted, err := w.pruneProcessed(ctx)
			if err != nil && ctx.Err() == nil {
				w.logger.Error("Go outbox retention failed", "error", err)
			} else if deleted > 0 {
				w.logger.Info("Go pruned processed outbox rows", "deleted", deleted, "retentionDays", 30)
			}
		}
		if processed {
			idleStreak = 0
			continue
		}
		idleStreak++
		index := idleStreak - 1
		if index >= len(idleBackoff) {
			index = len(idleBackoff) - 1
		}
		if !sleep(ctx, idleBackoff[index]) {
			break
		}
	}
	w.logger.Info("Go transactional outbox worker stopped", "workerId", w.workerID)
	return nil
}

func (w *Worker) processOne(ctx context.Context) (bool, error) {
	claimCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	event, err := w.claim(claimCtx)
	cancel()
	if err != nil || event == nil {
		return false, err
	}
	w.logger.Debug("Go claimed outbox event", "eventId", event.ID, "eventType", event.EventType, "attempt", event.Attempts)

	workCtx, workCancel := context.WithTimeout(ctx, processingTimeout)
	leaseCtx, stopHeartbeat := w.startLeaseHeartbeat(workCtx, event.ID)
	result, runErr := outboxevents.RunWithCacheRedis(leaseCtx, w.db, outboxevents.Request{
		EventID: event.ID, WorkerID: w.workerID,
	}, w.cacheRedis)
	stopHeartbeat()
	workCancel()
	if runErr != nil {
		if ctx.Err() == nil {
			if retryErr := w.markRetry(event, runErr); retryErr != nil {
				w.logger.Error("Go could not persist outbox retry; lease recovery will reclaim event", "eventId", event.ID, "error", retryErr)
			}
		}
		return true, runErr
	}
	if len(result.Created) > 0 {
		if err := w.publishNotifications(ctx, event.ID, result.Created); err != nil {
			// Notification rows and push-dispatch intents already committed with
			// the source ACK. As before, SSE/cache fan-out is post-commit best effort.
			w.logger.Warn("Go outbox post-commit notification fan-out failed; durable rows remain available", "eventId", event.ID, "count", len(result.Created), "error", err)
		}
	}
	w.logger.Info("Go processed outbox event", "eventId", event.ID, "eventType", event.EventType, "notifications", len(result.Created))
	return true, nil
}

func (w *Worker) claim(ctx context.Context) (*claimedEvent, error) {
	var event claimedEvent
	err := w.db.QueryRowContext(ctx, `
		WITH candidate AS (
			SELECT "id" FROM "outbox_events"
			WHERE "processedAt" IS NULL AND "deadLetterAt" IS NULL
			  AND "availableAt" <= NOW()
			  AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - ($1 * INTERVAL '1 second'))
			  AND "eventType" = ANY($2::text[])
			ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED
		)
		UPDATE "outbox_events" AS event
		SET "lockedAt" = NOW(), "lockedBy" = $3, "attempts" = event."attempts" + 1
		FROM candidate WHERE event."id" = candidate."id"
		RETURNING event."id", event."eventType", event."attempts"
	`, int(leaseDuration.Seconds()), EventTypes, w.workerID).Scan(&event.ID, &event.EventType, &event.Attempts)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &event, nil
}

func (w *Worker) startLeaseHeartbeat(parent context.Context, eventID string) (context.Context, func()) {
	workCtx, cancelWork := context.WithCancel(parent)
	done, stop := make(chan struct{}), make(chan struct{})
	go func() {
		defer close(done)
		ticker := time.NewTicker(leaseHeartbeatInterval)
		defer ticker.Stop()
		for {
			select {
			case <-parent.Done():
				return
			case <-stop:
				return
			case <-ticker.C:
				heartbeatCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				var ownedID string
				err := w.db.QueryRowContext(heartbeatCtx, `
					UPDATE "outbox_events" SET "lockedAt" = NOW()
					WHERE "id" = $1 AND "lockedBy" = $2
					  AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
					RETURNING "id"
				`, eventID, w.workerID).Scan(&ownedID)
				cancel()
				if errors.Is(err, sql.ErrNoRows) {
					w.logger.Warn("Go outbox lease ownership was lost; cancelling processing", "eventId", eventID)
					cancelWork()
					return
				}
				if err != nil {
					// A transient heartbeat failure does not extend the lease. Keep
					// trying until ownership is explicitly lost or work completes.
					w.logger.Warn("Go outbox lease heartbeat failed", "eventId", eventID, "error", err)
				}
			}
		}
	}()
	return workCtx, func() {
		close(stop)
		cancelWork()
		<-done
	}
}

func (w *Worker) markRetry(event *claimedEvent, cause error) error {
	message := cause.Error()
	if len(message) > 1000 {
		message = message[:1000]
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if event.Attempts >= maxProcessingAttempts {
		result, err := w.db.ExecContext(ctx, `
			UPDATE "outbox_events"
			SET "deadLetterAt" = NOW(), "lockedAt" = NULL, "lockedBy" = NULL, "lastError" = $3
			WHERE "id" = $1 AND "lockedBy" = $2 AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
		`, event.ID, w.workerID, message)
		if err != nil {
			return err
		}
		changed, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if changed == 1 {
			w.logger.Error("Go quarantined outbox event after bounded retries; payload retained", "eventId", event.ID, "eventType", event.EventType, "attempts", event.Attempts, "error", message)
		} else if changed == 0 {
			w.logger.Warn("Go did not quarantine event because lease ownership or state changed", "eventId", event.ID)
		}
		return nil
	}
	delay := retryDelay(event.Attempts)
	result, err := w.db.ExecContext(ctx, `
		UPDATE "outbox_events"
		SET "lockedAt" = NULL, "lockedBy" = NULL,
		    "availableAt" = NOW() + ($3 * INTERVAL '1 millisecond'), "lastError" = $4
		WHERE "id" = $1 AND "lockedBy" = $2 AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
	`, event.ID, w.workerID, delay.Milliseconds(), message)
	if err != nil {
		return err
	}
	changed, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if changed != 1 {
		w.logger.Warn("Go retry was not persisted because lease ownership or event state changed", "eventId", event.ID, "attempts", event.Attempts)
		return nil
	}
	w.logger.Error("Go outbox processing failed; retry persisted", "eventId", event.ID, "eventType", event.EventType, "attempts", event.Attempts, "retryDelayMs", delay.Milliseconds(), "error", message)
	return nil
}

func retryDelay(attempt int) time.Duration {
	exponent := attempt - 1
	if exponent < 0 {
		exponent = 0
	}
	if exponent > 12 {
		exponent = 12
	}
	delay := time.Second * time.Duration(1<<exponent)
	if delay > maxBackoff {
		return maxBackoff
	}
	return delay
}

func (w *Worker) publishNotifications(ctx context.Context, eventID string, notifications []outboxevents.Notification) error {
	batches, err := splitNotificationBatches(eventID, notifications, callbackBatchSize, callbackMaxPayloadSize)
	if err != nil {
		return err
	}
	for _, batch := range batches {
		payload, err := json.Marshal(publishRequest{EventID: eventID, Notifications: batch})
		if err != nil {
			return fmt.Errorf("encode notification callback: %w", err)
		}
		requestCtx, cancel := context.WithTimeout(ctx, 6*time.Second)
		request, err := http.NewRequestWithContext(requestCtx, http.MethodPost, w.apiBaseURL+"/internal/go-worker/publish-outbox-notifications", bytes.NewReader(payload))
		if err != nil {
			cancel()
			return err
		}
		request.Header.Set("Authorization", "Bearer "+w.apiToken)
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Accept", "application/json")
		response, err := w.httpClient.Do(request)
		if err != nil {
			cancel()
			return fmt.Errorf("send notification callback: %w", err)
		}
		response.Body.Close()
		cancel()
		if response.StatusCode < 200 || response.StatusCode >= 300 {
			return fmt.Errorf("notification callback returned HTTP %d", response.StatusCode)
		}
	}
	return nil
}

// splitNotificationBatches keeps the serialized callback below Express's
// 50KB global JSON parser limit, with 10KB of headroom for parser/encoding
// differences. Item count remains capped independently by the route contract.
func splitNotificationBatches(eventID string, notifications []outboxevents.Notification, maxItems, maxBytes int) ([][]outboxevents.Notification, error) {
	if maxItems < 1 || maxBytes < 1 {
		return nil, errors.New("notification callback batch limits must be positive")
	}
	batches := make([][]outboxevents.Notification, 0)
	current := make([]outboxevents.Notification, 0, maxItems)
	for _, notification := range notifications {
		candidate := append(current, notification)
		payload, err := json.Marshal(publishRequest{EventID: eventID, Notifications: candidate})
		if err != nil {
			return nil, fmt.Errorf("encode notification callback batch: %w", err)
		}
		if len(candidate) > maxItems || len(payload) > maxBytes {
			if len(current) == 0 {
				return nil, fmt.Errorf("single notification callback exceeds %d-byte limit", maxBytes)
			}
			batches = append(batches, current)
			current = []outboxevents.Notification{notification}
			payload, err = json.Marshal(publishRequest{EventID: eventID, Notifications: current})
			if err != nil {
				return nil, fmt.Errorf("encode notification callback item: %w", err)
			}
			if len(payload) > maxBytes {
				return nil, fmt.Errorf("single notification callback exceeds %d-byte limit", maxBytes)
			}
			continue
		}
		current = candidate
	}
	if len(current) > 0 {
		batches = append(batches, current)
	}
	return batches, nil
}

func (w *Worker) pruneProcessed(parent context.Context) (int64, error) {
	ctx, cancel := context.WithTimeout(parent, 10*time.Second)
	defer cancel()
	result, err := w.db.ExecContext(ctx, `
		WITH candidates AS (
			SELECT "id" FROM "outbox_events"
			WHERE "processedAt" IS NOT NULL
			  AND "processedAt" < NOW() - ($1 * INTERVAL '1 millisecond')
			ORDER BY "processedAt" ASC LIMIT $2 FOR UPDATE SKIP LOCKED
		)
		DELETE FROM "outbox_events" AS event USING candidates
		WHERE event."id" = candidates."id"
	`, processedRetention.Milliseconds(), retentionBatchSize)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (w *Worker) reportHealth(parent context.Context) error {
	ctx, cancel := context.WithTimeout(parent, 5*time.Second)
	defer cancel()
	var pending, staleReady, expiredLeases, deadLetters, highAttempts int64
	var oldest sql.NullTime
	err := w.db.QueryRowContext(ctx, `
		SELECT
			COUNT(*) FILTER (WHERE "processedAt" IS NULL AND "deadLetterAt" IS NULL),
			MIN("createdAt") FILTER (WHERE "processedAt" IS NULL AND "deadLetterAt" IS NULL),
			COUNT(*) FILTER (WHERE "processedAt" IS NULL AND "deadLetterAt" IS NULL AND "availableAt" <= NOW()
			  AND "createdAt" < NOW() - ($2 * INTERVAL '1 second')
			  AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - ($1 * INTERVAL '1 second'))),
			COUNT(*) FILTER (WHERE "processedAt" IS NULL AND "deadLetterAt" IS NULL AND "lockedAt" IS NOT NULL
			  AND "lockedAt" < NOW() - ($1 * INTERVAL '1 second')),
			COUNT(*) FILTER (WHERE "processedAt" IS NULL AND "deadLetterAt" IS NOT NULL),
			COUNT(*) FILTER (WHERE "processedAt" IS NULL AND "deadLetterAt" IS NULL AND "attempts" >= $3)
		FROM "outbox_events"
	`, int(leaseDuration.Seconds()), int(staleEventAge.Seconds()), 10).Scan(&pending, &oldest, &staleReady, &expiredLeases, &deadLetters, &highAttempts)
	if err != nil {
		return err
	}
	if staleReady == 0 && expiredLeases == 0 && deadLetters == 0 && highAttempts == 0 {
		return nil
	}
	var oldestValue any
	if oldest.Valid {
		oldestValue = oldest.Time
	}
	w.logger.Warn("Go outbox queue health anomaly", "pendingCount", pending, "oldestPendingCreatedAt", oldestValue, "staleReadyCount", staleReady, "expiredLeaseCount", expiredLeases, "deadLetterCount", deadLetters, "highAttemptCount", highAttempts)
	return nil
}

func sleep(ctx context.Context, delay time.Duration) bool {
	timer := time.NewTimer(delay)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
