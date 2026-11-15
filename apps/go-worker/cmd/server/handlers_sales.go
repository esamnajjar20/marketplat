package main

import (
	"context"
	"net/http"
	"strings"
	"time"

	"marketplat/apps/go-worker/internal/salesinsights"
)

func (s *server) getSalesInsights(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	var request struct {
		UserID string `json:"userId"`
	}
	if !decodeStrictJSON(w, r, 1024, &request, "invalid request body") {
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
