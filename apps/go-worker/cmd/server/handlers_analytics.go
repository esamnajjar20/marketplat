package main

import (
	"context"
	"net/http"
	"time"

	"marketplat/apps/go-worker/internal/analyticsingest"
	"marketplat/apps/go-worker/internal/analyticssummary"
)

type analyticsEventsRequest struct {
	UserID *string                 `json:"userId"`
	Events []analyticsingest.Event `json:"events"`
}

func (s *server) ingestAnalyticsEvents(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var request analyticsEventsRequest
	if !decodeStrictJSON(w, r, 256*1024, &request, "invalid analytics request body") {
		return
	}
	if err := analyticsingest.Validate(analyticsingest.Request{UserID: request.UserID, Events: request.Events}); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()
	result, err := analyticsingest.Insert(ctx, s.db, analyticsingest.Request{UserID: request.UserID, Events: request.Events})
	if err != nil {
		s.logger.Warn("analytics ingest failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "analytics storage unavailable"})
		return
	}
	writeJSON(w, http.StatusAccepted, result)
}

func (s *server) getAnalyticsSummary(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var request analyticssummary.Request
	if !decodeStrictJSON(w, r, 2*1024, &request, "invalid analytics summary request") {
		return
	}
	if err := analyticssummary.Validate(request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	result, err := analyticssummary.Get(r.Context(), s.db, request)
	if err != nil {
		s.logger.Warn("analytics summary query failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "analytics summary unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, result)
}
