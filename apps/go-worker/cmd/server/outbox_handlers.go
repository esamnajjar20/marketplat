package main

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"marketplat/apps/go-worker/internal/outboxevents"
	"marketplat/apps/go-worker/internal/outboxworker"
)

type outboxEventRequest struct {
	EventID  string `json:"eventId"`
	WorkerID string `json:"workerId"`
}

// executeOutboxEvent is the synchronous Go adapter retained for the Express
// fallback consumer. The Go background consumer uses the same transactional
// outboxevents package directly.
func (s *server) executeOutboxEvent(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}

	var request outboxEventRequest
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 16*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid request body"})
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must contain one JSON object"})
		return
	}
	request.EventID = strings.TrimSpace(request.EventID)
	request.WorkerID = strings.TrimSpace(request.WorkerID)
	if request.EventID == "" || len(request.EventID) > 128 || request.WorkerID == "" || len(request.WorkerID) > 120 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "eventId and workerId are required"})
		return
	}

	ctx, cancel := contextWithOutboxTimeout(r)
	defer cancel()
	result, err := outboxevents.RunWithCacheRedis(ctx, s.db, outboxevents.Request{
		EventID:  request.EventID,
		WorkerID: request.WorkerID,
	}, s.cacheRedisConfig)
	if err != nil {
		if errors.Is(err, outboxevents.ErrEventNotOwned) {
			writeJSON(w, http.StatusConflict, map[string]string{"status": "lease-not-owned"})
			return
		}
		if errors.Is(err, outboxevents.ErrEventAlreadyProcessing) {
			writeJSON(w, http.StatusConflict, map[string]string{"status": "already-processing"})
			return
		}
		if errors.Is(err, outboxevents.ErrUnsupportedEvent) {
			writeJSON(w, http.StatusBadRequest, map[string]string{"error": "unsupported outbox event"})
			return
		}
		s.logger.Error("Go outbox event processing failed", "eventId", request.EventID, "error", err)
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "outbox event processing failed"})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func contextWithOutboxTimeout(r *http.Request) (context.Context, context.CancelFunc) {
	return context.WithTimeout(r.Context(), 90*time.Second)
}

// outboxWorkerStatus lets Express decide whether Go is the active primary
// consumer. When this flag is false (or Go is unreachable), the existing
// Express polling worker remains the automatic fallback.
func (s *server) outboxWorkerStatus(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	enabled := false
	if s.outboxEnabled {
		// If an event type has not yet been implemented in Go, let the existing
		// Express consumer handle the queue. This prevents new event types from
		// being stranded simply because the Go worker is enabled.
		var unsupported string
		err := s.db.QueryRowContext(r.Context(), `
			SELECT "eventType" FROM "outbox_events"
			WHERE "processedAt" IS NULL AND "deadLetterAt" IS NULL
			  AND "availableAt" <= NOW()
			  AND NOT ("eventType" = ANY($1::text[]))
			LIMIT 1
		`, outboxworker.EventTypes).Scan(&unsupported)
		if errors.Is(err, sql.ErrNoRows) {
			enabled = true
		} else if err != nil {
			s.logger.Warn("could not verify Go outbox event coverage; Express fallback will remain active", "error", err)
		}
	}
	writeJSON(w, http.StatusOK, map[string]bool{"enabled": enabled})
}

// pushDispatchWorkerStatus lets Express pause its local notification push
// dispatcher only after the Go worker goroutine has passed its schema/config
// readiness check. An unreachable or stopped Go worker therefore keeps the
// existing Express dispatcher as an automatic fallback.
func (s *server) pushDispatchWorkerStatus(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	enabled := s.pushDispatchEnabled && s.pushDispatchActive.Load()
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled": enabled,
		"active":  s.pushDispatchActive.Load(),
		"service": "marketplat-go-worker",
	})
}
