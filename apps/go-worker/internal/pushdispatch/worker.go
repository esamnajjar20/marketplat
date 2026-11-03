package pushdispatch

import (
	"bytes"
	"context"
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"marketplat/apps/go-worker/internal/fcmpush"
	"marketplat/apps/go-worker/internal/loadtracker"
)

const (
	leaseDuration            = 120 * time.Second
	leaseHeartbeatInterval   = 30 * time.Second
	providerTimeout          = 16 * time.Second
	dispatchWorkTimeout      = 2 * time.Minute
	maxConsecutivePollErrors = 5
	maxDispatchAttempts      = 25
	maxTargetAttempts        = 12
	maxBackoff               = time.Hour
	targetBatchSize          = 50
	targetConcurrency        = 10
	retentionInterval        = 10 * time.Minute
	retentionAge             = 30 * 24 * time.Hour
	retentionBatchSize       = 500
)

var idleBackoff = []time.Duration{time.Second, 2 * time.Second, 5 * time.Second, 10 * time.Second}

type Config struct {
	APIBaseURL  string
	APIToken    string
	FCM         *fcmpush.Client
	LoadTracker *loadtracker.Tracker
}

type Payload struct {
	Title            string `json:"title"`
	Body             string `json:"body"`
	URL              string `json:"url,omitempty"`
	Tag              string `json:"tag,omitempty"`
	Image            string `json:"image,omitempty"`
	Type             string `json:"type,omitempty"`
	Urgent           bool   `json:"urgent,omitempty"`
	BypassQuietHours bool   `json:"bypassQuietHours,omitempty"`
}

type dispatch struct {
	ID              string
	UserID          string
	Payload         []byte
	Attempts        int
	TargetsSeededAt sql.NullTime
}

type target struct {
	ID         string
	DispatchID string
	Channel    string
	TargetID   string
	Attempts   int
}

type outcome string

const (
	outcomeSent         outcome = "sent"
	outcomeGone         outcome = "gone"
	outcomeTransient    outcome = "transient"
	outcomeFailed       outcome = "failed"
	outcomeUnconfigured outcome = "unconfigured"
	outcomeMissing      outcome = "missing"
)

type targetResult struct {
	Target  target
	Outcome outcome
}

type QuietDecision struct {
	Blocked    bool
	ResumeInMs int64
}

type Worker struct {
	db          *sql.DB
	logger      *slog.Logger
	apiBaseURL  string
	apiToken    string
	fcm         *fcmpush.Client
	httpClient  *http.Client
	workerID    string
	loadTracker *loadtracker.Tracker
}

func New(db *sql.DB, logger *slog.Logger, config Config) *Worker {
	if logger == nil {
		logger = slog.Default()
	}
	return &Worker{
		db:          db,
		logger:      logger,
		apiBaseURL:  strings.TrimRight(strings.TrimSpace(config.APIBaseURL), "/"),
		apiToken:    strings.TrimSpace(config.APIToken),
		fcm:         config.FCM,
		httpClient:  &http.Client{Timeout: providerTimeout, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }},
		workerID:    randomWorkerID(),
		loadTracker: config.LoadTracker,
	}
}

func randomWorkerID() string {
	var raw [12]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return fmt.Sprintf("go-push-%d", time.Now().UnixNano())
	}
	return "go-push-" + hex.EncodeToString(raw[:])
}

// CheckReady is called before the API is told Go owns push dispatches. It
// verifies the exact tables/lease columns used by this worker and the private
// Express adapter needed for standards-compliant Web Push.
func (w *Worker) CheckReady(ctx context.Context) error {
	if w.db == nil {
		return errors.New("push dispatch database is required")
	}
	if w.apiBaseURL == "" || w.apiToken == "" {
		return errors.New("push dispatch requires GO_WORKER_API_URL and GO_WORKER_TOKEN for the Web Push adapter")
	}
	var ready bool
	err := w.db.QueryRowContext(ctx, `
		SELECT to_regclass('notification_push_dispatches') IS NOT NULL
		   AND to_regclass('notification_push_delivery_targets') IS NOT NULL
		   AND EXISTS (
		     SELECT 1 FROM information_schema.columns
		     WHERE table_schema = current_schema()
		       AND table_name = 'notification_push_delivery_targets'
		       AND column_name = 'lockedAt'
		   )
		   AND EXISTS (
		     SELECT 1 FROM information_schema.columns
		     WHERE table_schema = current_schema()
		       AND table_name = 'notification_push_delivery_targets'
		       AND column_name = 'lockedBy'
		   )
	`).Scan(&ready)
	if err != nil {
		return fmt.Errorf("check push dispatch schema: %w", err)
	}
	if !ready {
		return errors.New("notification push dispatch schema or target lease columns are missing")
	}
	requestCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()
	request, err := http.NewRequestWithContext(requestCtx, http.MethodGet, w.apiBaseURL+"/internal/go-worker/push-adapter/health", nil)
	if err != nil {
		return fmt.Errorf("build Express push adapter readiness request: %w", err)
	}
	request.Header.Set("Authorization", "Bearer "+w.apiToken)
	request.Header.Set("Accept", "application/json")
	response, err := w.httpClient.Do(request)
	if err != nil {
		return fmt.Errorf("Express push adapter is unreachable: %w", err)
	}
	defer response.Body.Close()
	if response.StatusCode != http.StatusOK {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 1024))
		return fmt.Errorf("Express push adapter readiness returned HTTP %d", response.StatusCode)
	}
	return nil
}

func (w *Worker) Run(ctx context.Context) error {
	if err := w.CheckReady(ctx); err != nil {
		return err
	}
	w.logger.Info("Go notification push dispatch worker started", "workerId", w.workerID, "leaseSeconds", int(leaseDuration.Seconds()))
	lastRetention := time.Time{}
	idleStreak := 0
	consecutivePollErrors := 0
	for ctx.Err() == nil {
		processed, err := w.processOne(ctx)
		if err != nil && ctx.Err() == nil {
			w.logger.Error("Go push dispatch iteration failed", "error", err)
			if !processed {
				consecutivePollErrors++
				if consecutivePollErrors >= maxConsecutivePollErrors {
					return fmt.Errorf("push dispatch database polling failed %d consecutive times; handing ownership back to Express", consecutivePollErrors)
				}
			}
		} else if !processed {
			consecutivePollErrors = 0
		}
		now := time.Now()
		if lastRetention.IsZero() || now.Sub(lastRetention) >= retentionInterval {
			lastRetention = now
			if deleted, pruneErr := w.pruneCompleted(ctx); pruneErr != nil && ctx.Err() == nil {
				w.logger.Warn("Go push dispatch retention failed", "error", pruneErr)
			} else if deleted > 0 {
				w.logger.Info("Go pruned completed push dispatches", "deleted", deleted, "retentionDays", 30)
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
	w.logger.Info("Go notification push dispatch worker stopped", "workerId", w.workerID)
	return nil
}

func (w *Worker) processOne(ctx context.Context) (bool, error) {
	claimCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	d, err := w.claimDispatch(claimCtx)
	cancel()
	if err != nil || d == nil {
		return false, err
	}
	releaseLoad := w.loadTracker.Begin()
	defer releaseLoad()
	workCtx, cancelWork := context.WithTimeout(ctx, dispatchWorkTimeout)
	stopHeartbeat := w.startDispatchHeartbeat(workCtx, d.ID, cancelWork)
	processErr := w.processDispatch(workCtx, d)
	stopHeartbeat()
	cancelWork()
	if processErr != nil && ctx.Err() == nil {
		// Release this worker's still-pending target leases before scheduling the
		// parent retry. Otherwise a failed persistence step would leave the
		// dispatch asleep until every target lease expired (up to 120 seconds).
		// Outcomes already committed remain terminal, so only unpersisted targets
		// become eligible again; delivery remains at-least-once by design.
		if releaseErr := w.releaseTargetLeases(d.ID); releaseErr != nil {
			w.logger.Warn("Go could not release push target leases after dispatch failure; lease expiry will recover them", "dispatchId", d.ID, "error", releaseErr)
		}
		if retryErr := w.markDispatchRetry(d, processErr); retryErr != nil {
			w.logger.Error("Go could not persist push dispatch retry; lease recovery will reclaim it", "dispatchId", d.ID, "error", retryErr)
		}
		return true, processErr
	}
	return true, nil
}

func (w *Worker) claimDispatch(ctx context.Context) (*dispatch, error) {
	var d dispatch
	err := w.db.QueryRowContext(ctx, `
		WITH candidate AS (
			SELECT "id" FROM "notification_push_dispatches"
			WHERE "processedAt" IS NULL AND "deadLetterAt" IS NULL
			  AND "availableAt" <= NOW()
			  AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - ($1 * INTERVAL '1 second'))
			ORDER BY "createdAt" ASC LIMIT 1 FOR UPDATE SKIP LOCKED
		)
		UPDATE "notification_push_dispatches" AS dispatch
		SET "lockedAt" = NOW(), "lockedBy" = $2, "attempts" = dispatch."attempts" + 1
		FROM candidate WHERE dispatch."id" = candidate."id"
		RETURNING dispatch."id", dispatch."userId", dispatch."payload", dispatch."attempts", dispatch."targetsSeededAt"
	`, int(leaseDuration.Seconds()), w.workerID).Scan(&d.ID, &d.UserID, &d.Payload, &d.Attempts, &d.TargetsSeededAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &d, nil
}

func (w *Worker) startDispatchHeartbeat(parent context.Context, dispatchID string, cancelWork context.CancelFunc) func() {
	stop, done := make(chan struct{}), make(chan struct{})
	var once sync.Once
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
				var owned string
				err := w.db.QueryRowContext(heartbeatCtx, `
					UPDATE "notification_push_dispatches" SET "lockedAt" = NOW()
					WHERE "id" = $1 AND "lockedBy" = $2
					  AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
					RETURNING "id"
				`, dispatchID, w.workerID).Scan(&owned)
				cancel()
				if errors.Is(err, sql.ErrNoRows) {
					w.logger.Warn("Go push dispatch lease ownership was lost; cancelling delivery", "dispatchId", dispatchID)
					cancelWork()
					return
				}
				if err != nil {
					w.logger.Warn("Go push dispatch lease heartbeat failed", "dispatchId", dispatchID, "error", err)
				}
			}
		}
	}()
	return func() {
		once.Do(func() { close(stop) })
		<-done
	}
}

func (w *Worker) processDispatch(ctx context.Context, d *dispatch) error {
	var payload Payload
	if err := json.Unmarshal(d.Payload, &payload); err != nil {
		return fmt.Errorf("decode push dispatch payload: %w", err)
	}
	if strings.TrimSpace(payload.Title) == "" || len(payload.Title) > 256 || len(payload.Body) > 4096 || len(payload.URL) > 2048 || len(payload.Tag) > 256 || len(payload.Image) > 2048 || len(payload.Type) > 80 {
		return errors.New("push dispatch payload is invalid")
	}
	quiet := w.quietHoursDecision(ctx, d.UserID, payload.Urgent)
	if quiet.Blocked && !payload.BypassQuietHours {
		deferred, err := w.db.ExecContext(ctx, `
			UPDATE "notification_push_dispatches"
			SET "availableAt" = NOW() + ($3 * INTERVAL '1 millisecond'),
			    "attempts" = GREATEST("attempts" - 1, 0), "lockedAt" = NULL, "lockedBy" = NULL
			WHERE "id" = $1 AND "lockedBy" = $2 AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
		`, d.ID, w.workerID, quiet.ResumeInMs)
		if err != nil {
			return fmt.Errorf("defer push dispatch during quiet hours: %w", err)
		}
		if count, _ := deferred.RowsAffected(); count != 1 {
			return errors.New("push dispatch lease lost during quiet-hours deferral")
		}
		return nil
	}
	if !d.TargetsSeededAt.Valid {
		if err := w.seedTargets(ctx, d.ID); err != nil {
			return err
		}
	}
	if err := w.failAbandonedExhaustedTargets(ctx, d.ID); err != nil {
		return err
	}
	targets, err := w.claimTargets(ctx, d.ID)
	if err != nil {
		return err
	}
	var results []targetResult
	if len(targets) > 0 {
		targetCtx, cancelTargets := context.WithCancel(ctx)
		stopTargetHeartbeat := w.startTargetHeartbeat(targetCtx, d.ID, cancelTargets)
		results = w.deliverTargets(targetCtx, d.UserID, payload, targets)
		stopTargetHeartbeat()
		cancelTargets()
	}
	for _, result := range results {
		if err := w.persistTargetOutcome(ctx, d.ID, result); err != nil {
			return err
		}
	}
	var pending, failed, total int
	if err := w.db.QueryRowContext(ctx, `
		SELECT COUNT(*) FILTER (WHERE "status" = 'PENDING')::int,
		       COUNT(*) FILTER (WHERE "status" = 'FAILED')::int,
		       COUNT(*)::int
		FROM "notification_push_delivery_targets" WHERE "dispatchId" = $1
	`, d.ID).Scan(&pending, &failed, &total); err != nil {
		return fmt.Errorf("summarize push delivery targets: %w", err)
	}
	if pending > 0 {
		var retryError any
		if failed > 0 {
			retryError = fmt.Sprintf("Target failures: %d/%d", failed, total)
		}
		result, err := w.db.ExecContext(ctx, `
			UPDATE "notification_push_dispatches" AS dispatch
			SET "availableAt" = COALESCE((
			      SELECT MIN(GREATEST(target."availableAt",
			        COALESCE(target."lockedAt" + ($3 * INTERVAL '1 second'), target."availableAt")))
			      FROM "notification_push_delivery_targets" AS target
			      WHERE target."dispatchId" = dispatch."id" AND target."status" = 'PENDING'
			    ), NOW() + INTERVAL '1 second'),
			    "lockedAt" = NULL, "lockedBy" = NULL, "lastError" = $4
			WHERE dispatch."id" = $1 AND dispatch."lockedBy" = $2
			  AND dispatch."processedAt" IS NULL AND dispatch."deadLetterAt" IS NULL
		`, d.ID, w.workerID, int(leaseDuration.Seconds()), retryError)
		if err != nil {
			return fmt.Errorf("schedule pending push targets: %w", err)
		}
		if count, _ := result.RowsAffected(); count != 1 {
			return errors.New("push dispatch lease lost while scheduling pending targets")
		}
		return nil
	}
	var lastError any
	if failed > 0 {
		lastError = fmt.Sprintf("Target failures: %d/%d", failed, total)
	}
	result, err := w.db.ExecContext(ctx, `
		UPDATE "notification_push_dispatches" AS dispatch
		SET "processedAt" = NOW(), "lockedAt" = NULL, "lockedBy" = NULL, "lastError" = $3
		WHERE dispatch."id" = $1 AND dispatch."lockedBy" = $2
		  AND dispatch."processedAt" IS NULL AND dispatch."deadLetterAt" IS NULL
		  AND NOT EXISTS (
		    SELECT 1 FROM "notification_push_delivery_targets" AS target
		    WHERE target."dispatchId" = dispatch."id" AND target."status" = 'PENDING'
		  )
	`, d.ID, w.workerID, lastError)
	if err != nil {
		return fmt.Errorf("acknowledge push dispatch: %w", err)
	}
	if count, _ := result.RowsAffected(); count != 1 {
		return errors.New("push dispatch was not acknowledged because lease ownership was lost or targets remain pending")
	}
	if failed > 0 {
		w.logger.Error("Go push dispatch completed with per-target failures", "dispatchId", d.ID, "failed", failed, "total", total)
	}
	return nil
}

func (w *Worker) seedTargets(ctx context.Context, dispatchID string) error {
	tx, err := w.db.BeginTx(ctx, nil)
	if err != nil {
		return fmt.Errorf("begin push target seeding: %w", err)
	}
	defer tx.Rollback()
	var owned bool
	if err := tx.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM "notification_push_dispatches"
		WHERE "id" = $1 AND "lockedBy" = $2 AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
	)`, dispatchID, w.workerID).Scan(&owned); err != nil {
		return fmt.Errorf("verify dispatch ownership before target seeding: %w", err)
	}
	if !owned {
		return errors.New("push dispatch lease lost before target seeding")
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO "notification_push_delivery_targets" ("id", "dispatchId", "channel", "targetId")
		SELECT md5(random()::text || clock_timestamp()::text || subscription."id"), $1, 'WEB_PUSH', subscription."id"
		FROM "push_subscriptions" AS subscription
		JOIN "notification_push_dispatches" AS dispatch ON dispatch."id" = $1
		WHERE subscription."userId" = dispatch."userId"
		ON CONFLICT ("dispatchId", "channel", "targetId") DO NOTHING
	`, dispatchID); err != nil {
		return fmt.Errorf("seed web push delivery targets: %w", err)
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO "notification_push_delivery_targets" ("id", "dispatchId", "channel", "targetId")
		SELECT md5(random()::text || clock_timestamp()::text || token."id"), $1, 'FCM', token."id"
		FROM "fcm_device_tokens" AS token
		JOIN "notification_push_dispatches" AS dispatch ON dispatch."id" = $1
		WHERE token."userId" = dispatch."userId"
		ON CONFLICT ("dispatchId", "channel", "targetId") DO NOTHING
	`, dispatchID); err != nil {
		return fmt.Errorf("seed FCM delivery targets: %w", err)
	}
	result, err := tx.ExecContext(ctx, `
		UPDATE "notification_push_dispatches"
		SET "targetsSeededAt" = NOW()
		WHERE "id" = $1 AND "lockedBy" = $2 AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
	`, dispatchID, w.workerID)
	if err != nil {
		return fmt.Errorf("mark push targets seeded: %w", err)
	}
	if count, _ := result.RowsAffected(); count != 1 {
		return errors.New("push dispatch lease lost while marking targets seeded")
	}
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("commit push targets: %w", err)
	}
	return nil
}

func (w *Worker) failAbandonedExhaustedTargets(ctx context.Context, dispatchID string) error {
	_, err := w.db.ExecContext(ctx, `
		UPDATE "notification_push_delivery_targets"
		SET "status" = 'FAILED', "processedAt" = NOW(),
		    "lastError" = 'Target retry limit reached after abandoned attempts',
		    "lockedAt" = NULL, "lockedBy" = NULL
		WHERE "dispatchId" = $1 AND "status" = 'PENDING'
		  AND "attempts" >= $2
		  AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - ($3 * INTERVAL '1 second'))
	`, dispatchID, maxTargetAttempts, int(leaseDuration.Seconds()))
	if err != nil {
		return fmt.Errorf("terminalize exhausted push targets: %w", err)
	}
	return nil
}

func (w *Worker) claimTargets(ctx context.Context, dispatchID string) ([]target, error) {
	rows, err := w.db.QueryContext(ctx, `
		WITH candidates AS (
			SELECT "id" FROM "notification_push_delivery_targets"
			WHERE "dispatchId" = $1 AND "status" = 'PENDING'
			  AND "availableAt" <= NOW() AND "attempts" < $3
			  AND ("lockedAt" IS NULL OR "lockedAt" < NOW() - ($4 * INTERVAL '1 second'))
			ORDER BY "createdAt" ASC LIMIT $2 FOR UPDATE SKIP LOCKED
		)
		UPDATE "notification_push_delivery_targets" AS target
		SET "lockedAt" = NOW(), "lockedBy" = $5, "attempts" = target."attempts" + 1
		FROM candidates WHERE target."id" = candidates."id"
		RETURNING target."id", target."dispatchId", target."channel", target."targetId", target."attempts"
	`, dispatchID, targetBatchSize, maxTargetAttempts, int(leaseDuration.Seconds()), w.workerID)
	if err != nil {
		return nil, fmt.Errorf("claim push delivery targets: %w", err)
	}
	defer rows.Close()
	var targets []target
	for rows.Next() {
		var item target
		if err := rows.Scan(&item.ID, &item.DispatchID, &item.Channel, &item.TargetID, &item.Attempts); err != nil {
			return nil, err
		}
		targets = append(targets, item)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return targets, nil
}

func (w *Worker) deliverTargets(ctx context.Context, userID string, payload Payload, targets []target) []targetResult {
	results := make([]targetResult, len(targets))
	sem := make(chan struct{}, targetConcurrency)
	var wg sync.WaitGroup
	for i := range targets {
		i := i
		select {
		case sem <- struct{}{}:
		case <-ctx.Done():
			for j := i; j < len(targets); j++ {
				results[j] = targetResult{Target: targets[j], Outcome: outcomeTransient}
			}
			wg.Wait()
			return results
		}
		wg.Add(1)
		go func() {
			defer wg.Done()
			defer func() { <-sem }()
			item := targets[i]
			result := w.sendTarget(ctx, userID, item, payload)
			results[i] = targetResult{Target: item, Outcome: result}
		}()
	}
	wg.Wait()
	return results
}

func (w *Worker) sendTarget(parent context.Context, userID string, item target, payload Payload) outcome {
	ctx, cancel := context.WithTimeout(parent, providerTimeout)
	defer cancel()
	switch item.Channel {
	case "WEB_PUSH":
		return w.sendViaAPI(ctx, item.Channel, userID, item.TargetID, payload)
	case "FCM":
		if w.fcm == nil || w.fcm.ConfigurationStatus() != "ready" {
			return w.sendViaAPI(ctx, item.Channel, userID, item.TargetID, payload)
		}
		var deviceToken string
		err := w.db.QueryRowContext(ctx, `
			SELECT "token" FROM "fcm_device_tokens" WHERE "id" = $1 AND "userId" = $2 LIMIT 1
		`, item.TargetID, userID).Scan(&deviceToken)
		if errors.Is(err, sql.ErrNoRows) {
			return outcomeMissing
		}
		if err != nil {
			w.logger.Warn("Go FCM target lookup failed", "targetId", item.TargetID)
			return outcomeTransient
		}
		fcmPayload := fcmpush.Payload{Title: payload.Title, Body: payload.Body, URL: payload.URL, Tag: payload.Tag}
		result := w.fcm.Send(ctx, deviceToken, fcmPayload)
		if result == fcmpush.OutcomeGone {
			if _, err := w.db.ExecContext(ctx, `
				DELETE FROM "fcm_device_tokens" WHERE "id" = $1 AND "userId" = $2 AND "token" = $3
			`, item.TargetID, userID, deviceToken); err != nil {
				w.logger.Warn("Go could not prune stale FCM token", "targetId", item.TargetID, "error", err)
			}
		}
		return outcome(result)
	default:
		return outcomeFailed
	}
}

type apiSendRequest struct {
	Channel  string  `json:"channel"`
	UserID   string  `json:"userId"`
	TargetID string  `json:"targetId"`
	Payload  Payload `json:"payload"`
}

func (w *Worker) sendViaAPI(ctx context.Context, channel, userID, targetID string, payload Payload) outcome {
	body, err := json.Marshal(apiSendRequest{Channel: channel, UserID: userID, TargetID: targetID, Payload: payload})
	if err != nil {
		return outcomeFailed
	}
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, w.apiBaseURL+"/internal/go-worker/send-push-target", bytes.NewReader(body))
	if err != nil {
		return outcomeTransient
	}
	request.Header.Set("Authorization", "Bearer "+w.apiToken)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Accept", "application/json")
	response, err := w.httpClient.Do(request)
	if err != nil {
		return outcomeTransient
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, 2048))
	if err != nil {
		return outcomeTransient
	}
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return outcomeTransient
	}
	var result struct {
		Outcome string `json:"outcome"`
	}
	if err := json.Unmarshal(responseBody, &result); err != nil {
		return outcomeTransient
	}
	switch outcome(result.Outcome) {
	case outcomeSent, outcomeGone, outcomeTransient, outcomeFailed, outcomeUnconfigured, outcomeMissing:
		return outcome(result.Outcome)
	default:
		return outcomeTransient
	}
}

func (w *Worker) persistTargetOutcome(ctx context.Context, dispatchID string, result targetResult) error {
	item := result.Target
	switch result.Outcome {
	case outcomeSent, outcomeGone, outcomeMissing:
		status := "SENT"
		if result.Outcome != outcomeSent {
			status = "GONE"
		}
		res, err := w.db.ExecContext(ctx, `
			UPDATE "notification_push_delivery_targets"
			SET "status" = $4, "processedAt" = NOW(), "lastError" = NULL, "lockedAt" = NULL, "lockedBy" = NULL
			WHERE "id" = $1 AND "dispatchId" = $2 AND "status" = 'PENDING' AND "lockedBy" = $3
		`, item.ID, dispatchID, w.workerID, status)
		return checkOneRow(res, err, "persist push target success")
	case outcomeTransient:
		if item.Attempts < maxTargetAttempts {
			delay := retryDelay(item.Attempts)
			res, err := w.db.ExecContext(ctx, `
				UPDATE "notification_push_delivery_targets"
				SET "availableAt" = NOW() + ($4 * INTERVAL '1 millisecond'),
				    "lastError" = 'Transient provider failure', "lockedAt" = NULL, "lockedBy" = NULL
				WHERE "id" = $1 AND "dispatchId" = $2 AND "status" = 'PENDING' AND "lockedBy" = $3
			`, item.ID, dispatchID, w.workerID, delay.Milliseconds())
			return checkOneRow(res, err, "persist push target retry")
		}
		return w.persistTargetFailure(ctx, dispatchID, item, "Transient retry limit reached")
	case outcomeUnconfigured:
		return w.persistTargetFailure(ctx, dispatchID, item, "Provider not configured: "+item.Channel)
	case outcomeFailed:
		return w.persistTargetFailure(ctx, dispatchID, item, "Permanent provider failure")
	default:
		return w.persistTargetFailure(ctx, dispatchID, item, "Unsupported push delivery channel")
	}
}

func (w *Worker) persistTargetFailure(ctx context.Context, dispatchID string, item target, message string) error {
	res, err := w.db.ExecContext(ctx, `
		UPDATE "notification_push_delivery_targets"
		SET "status" = 'FAILED', "processedAt" = NOW(), "lastError" = $4, "lockedAt" = NULL, "lockedBy" = NULL
		WHERE "id" = $1 AND "dispatchId" = $2 AND "status" = 'PENDING' AND "lockedBy" = $3
	`, item.ID, dispatchID, w.workerID, message[:min(len(message), 1000)])
	return checkOneRow(res, err, "persist push target failure")
}

func checkOneRow(result sql.Result, err error, operation string) error {
	if err != nil {
		return fmt.Errorf("%s: %w", operation, err)
	}
	count, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("%s rows affected: %w", operation, err)
	}
	if count != 1 {
		return fmt.Errorf("%s: lease ownership was lost", operation)
	}
	return nil
}

func (w *Worker) startTargetHeartbeat(parent context.Context, dispatchID string, cancelWork context.CancelFunc) func() {
	stop, done := make(chan struct{}), make(chan struct{})
	var once sync.Once
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
				rows, err := w.db.QueryContext(heartbeatCtx, `
					UPDATE "notification_push_delivery_targets" AS target
					SET "lockedAt" = NOW()
					WHERE target."dispatchId" = $1 AND target."status" = 'PENDING' AND target."lockedBy" = $2
					  AND EXISTS (
					    SELECT 1 FROM "notification_push_dispatches" AS dispatch
					    WHERE dispatch."id" = target."dispatchId" AND dispatch."lockedBy" = $2
					      AND dispatch."processedAt" IS NULL AND dispatch."deadLetterAt" IS NULL
					      AND dispatch."lockedAt" >= NOW() - ($3 * INTERVAL '1 second')
					  )
					RETURNING target."id"
				`, dispatchID, w.workerID, int(leaseDuration.Seconds()))
				count := 0
				if err == nil {
					for rows.Next() {
						count++
					}
					if rowsErr := rows.Err(); rowsErr != nil {
						err = rowsErr
					}
					_ = rows.Close()
				}
				cancel()
				if err != nil {
					w.logger.Warn("Go push target lease heartbeat failed", "dispatchId", dispatchID, "error", err)
					continue
				}
				if count == 0 {
					w.logger.Warn("Go push target lease ownership was lost; cancelling provider calls", "dispatchId", dispatchID)
					cancelWork()
					return
				}
			}
		}
	}()
	return func() { once.Do(func() { close(stop) }); <-done }
}

func (w *Worker) releaseTargetLeases(dispatchID string) error {
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_, err := w.db.ExecContext(ctx, `
		UPDATE "notification_push_delivery_targets"
		SET "lockedAt" = NULL, "lockedBy" = NULL
		WHERE "dispatchId" = $1 AND "status" = 'PENDING' AND "lockedBy" = $2
	`, dispatchID, w.workerID)
	if err != nil {
		return fmt.Errorf("release pending push target leases: %w", err)
	}
	return nil
}

func (w *Worker) markDispatchRetry(d *dispatch, cause error) error {
	message := cause.Error()
	if len(message) > 1000 {
		message = message[:1000]
	}
	ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	if d.Attempts >= maxDispatchAttempts {
		var quarantined int
		err := w.db.QueryRowContext(ctx, `
			WITH quarantined_dispatch AS (
				UPDATE "notification_push_dispatches" AS dispatch
				SET "deadLetterAt" = NOW(), "lockedAt" = NULL, "lockedBy" = NULL, "lastError" = $3
				WHERE dispatch."id" = $1 AND dispatch."lockedBy" = $2
				  AND dispatch."processedAt" IS NULL AND dispatch."deadLetterAt" IS NULL
				  AND NOT EXISTS (
				    SELECT 1 FROM "notification_push_delivery_targets" AS target
				    WHERE target."dispatchId" = dispatch."id" AND target."status" = 'PENDING'
				      AND target."lockedAt" IS NOT NULL
				      AND target."lockedAt" >= NOW() - ($4 * INTERVAL '1 second')
				  ) RETURNING dispatch."id"
			), terminalized AS (
				UPDATE "notification_push_delivery_targets" AS target
				SET "status" = 'FAILED', "processedAt" = NOW(),
				    "lastError" = 'Parent push dispatch quarantined after bounded retries',
				    "lockedAt" = NULL, "lockedBy" = NULL
				FROM quarantined_dispatch AS dispatch
				WHERE target."dispatchId" = dispatch."id" AND target."status" = 'PENDING'
				RETURNING target."id"
			)
			SELECT COUNT(*)::int FROM quarantined_dispatch
		`, d.ID, w.workerID, message, int(leaseDuration.Seconds())).Scan(&quarantined)
		if err != nil {
			return fmt.Errorf("quarantine push dispatch: %w", err)
		}
		if quarantined == 1 {
			w.logger.Error("Go push dispatch moved to dead-letter quarantine", "dispatchId", d.ID, "attempts", d.Attempts, "error", message)
			return nil
		}
		res, err := w.db.ExecContext(ctx, `
			UPDATE "notification_push_dispatches"
			SET "availableAt" = NOW() + INTERVAL '1 second', "lockedAt" = NULL, "lockedBy" = NULL, "lastError" = $3
			WHERE "id" = $1 AND "lockedBy" = $2 AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
		`, d.ID, w.workerID, message)
		if err != nil {
			return fmt.Errorf("defer push dispatch quarantine: %w", err)
		}
		if count, _ := res.RowsAffected(); count != 1 {
			return errors.New("push dispatch lease lost while deferring quarantine")
		}
		w.logger.Warn("Go push dispatch quarantine deferred while a target lease may still be active", "dispatchId", d.ID)
		return nil
	}
	delay := retryDelay(d.Attempts)
	res, err := w.db.ExecContext(ctx, `
		UPDATE "notification_push_dispatches"
		SET "availableAt" = NOW() + ($3 * INTERVAL '1 millisecond'), "lockedAt" = NULL, "lockedBy" = NULL, "lastError" = $4
		WHERE "id" = $1 AND "lockedBy" = $2 AND "processedAt" IS NULL AND "deadLetterAt" IS NULL
	`, d.ID, w.workerID, delay.Milliseconds(), message)
	if err != nil {
		return fmt.Errorf("persist push dispatch retry: %w", err)
	}
	if count, _ := res.RowsAffected(); count != 1 {
		return errors.New("push dispatch lease lost while persisting retry")
	}
	return nil
}

func (w *Worker) pruneCompleted(ctx context.Context) (int64, error) {
	result, err := w.db.ExecContext(ctx, `
		DELETE FROM "notification_push_dispatches" AS dispatch
		WHERE dispatch."id" IN (
			SELECT candidate."id" FROM "notification_push_dispatches" AS candidate
			WHERE candidate."processedAt" IS NOT NULL
			  AND candidate."processedAt" < NOW() - ($1 * INTERVAL '1 millisecond')
			ORDER BY candidate."processedAt" ASC LIMIT $2 FOR UPDATE SKIP LOCKED
		)
	`, retentionAge.Milliseconds(), retentionBatchSize)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

func (w *Worker) quietHoursDecision(ctx context.Context, userID string, urgent bool) QuietDecision {
	var raw []byte
	err := w.db.QueryRowContext(ctx, `SELECT "notificationPreferences" FROM "users" WHERE "id" = $1`, userID).Scan(&raw)
	if err != nil {
		// Match Express's established fail-open behavior: a preferences read
		// failure must not silently swallow an otherwise valid notification.
		w.logger.Warn("Go push quiet-hours lookup failed; allowing delivery", "userId", userID, "error", err)
		return QuietDecision{}
	}
	var prefs map[string]any
	if len(raw) > 0 {
		_ = json.Unmarshal(raw, &prefs)
	}
	return evaluateQuietHours(prefs, urgent, time.Now())
}

func evaluateQuietHours(prefs map[string]any, urgent bool, now time.Time) QuietDecision {
	if prefs == nil || prefs["quietHoursEnabled"] != true {
		return QuietDecision{}
	}
	allowUrgent, hasAllow := prefs["quietHoursAllowUrgent"].(bool)
	if urgent && (!hasAllow || allowUrgent) {
		return QuietDecision{}
	}
	startHour, startMinute := parseClock(prefs["quietHoursStart"], 22, 0)
	endHour, endMinute := parseClock(prefs["quietHoursEnd"], 8, 0)
	startMinuteOfDay := startHour*60 + startMinute
	endMinuteOfDay := endHour*60 + endMinute
	if startMinuteOfDay == endMinuteOfDay {
		return QuietDecision{}
	}
	zoneName, _ := prefs["quietHoursTimeZone"].(string)
	if len(zoneName) == 0 || len(zoneName) > 64 {
		zoneName = "Asia/Gaza"
	}
	location, err := time.LoadLocation(zoneName)
	if err != nil {
		location, _ = time.LoadLocation("Asia/Gaza")
	}
	local := now.In(location)
	nowMinute := local.Hour()*60 + local.Minute()
	inside := false
	if startMinuteOfDay < endMinuteOfDay {
		inside = nowMinute >= startMinuteOfDay && nowMinute < endMinuteOfDay
	} else {
		inside = nowMinute >= startMinuteOfDay || nowMinute < endMinuteOfDay
	}
	if !inside {
		return QuietDecision{}
	}
	minutesToEnd := (endMinuteOfDay - nowMinute + 24*60) % (24 * 60)
	resume := int64(minutesToEnd*60_000 - local.Second()*1_000)
	if resume < 1_000 {
		resume = 1_000
	}
	return QuietDecision{Blocked: true, ResumeInMs: resume}
}

func parseClock(value any, fallbackHour, fallbackMinute int) (int, int) {
	raw, ok := value.(string)
	if !ok || len(raw) < 4 || len(raw) > 5 {
		return fallbackHour, fallbackMinute
	}
	parts := strings.Split(raw, ":")
	if len(parts) != 2 || len(parts[0]) < 1 || len(parts[0]) > 2 || len(parts[1]) != 2 {
		return fallbackHour, fallbackMinute
	}
	h, err := strconv.Atoi(parts[0])
	if err != nil {
		return fallbackHour, fallbackMinute
	}
	m, err := strconv.Atoi(parts[1])
	if err != nil {
		return fallbackHour, fallbackMinute
	}
	return int(math.Max(0, math.Min(23, float64(h)))), int(math.Max(0, math.Min(59, float64(m))))
}

func retryDelay(attempt int) time.Duration {
	exponent := attempt
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

func sleep(ctx context.Context, duration time.Duration) bool {
	timer := time.NewTimer(duration)
	defer timer.Stop()
	select {
	case <-ctx.Done():
		return false
	case <-timer.C:
		return true
	}
}
