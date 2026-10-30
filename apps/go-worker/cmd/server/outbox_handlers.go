package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"marketplat/apps/go-worker/internal/outboxevents"
)

type outboxEventRequest struct {
	EventID  string `json:"eventId"`
	WorkerID string `json:"workerId"`
}

// executeOutboxEvent delegates the database-heavy part of selected durable
// outbox events to Go. Express still owns polling, lease heartbeat, Redis/SSE,
// and provider delivery; the event row is acknowledged transactionally here.
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
