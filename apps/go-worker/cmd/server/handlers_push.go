package main

import (
	"context"
	"database/sql"
	"errors"
	"net/http"
	"strings"
	"time"

	"marketplat/apps/go-worker/internal/fcmpush"
)

type fcmPushRequest struct {
	UserID   string          `json:"userId"`
	TargetID string          `json:"targetId"`
	Payload  fcmpush.Payload `json:"payload"`
}

func (s *server) sendFcmPush(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var request fcmPushRequest
	if !decodeStrictJSON(w, r, 8*1024, &request, "invalid request body") {
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
