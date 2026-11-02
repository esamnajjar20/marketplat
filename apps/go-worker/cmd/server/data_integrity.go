package main

import (
	"context"
	"errors"
	"net/http"
	"time"

	"marketplat/apps/go-worker/internal/dataintegrity"
)

const dataIntegrityScanTimeout = 22 * time.Second

func (s *server) runDataIntegrityScan(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if !requireEmptyJSONObject(w, r, 1024) {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), dataIntegrityScanTimeout)
	defer cancel()
	report, err := dataintegrity.Scan(ctx, s.db)
	if err != nil {
		if s.logger != nil {
			s.logger.Error("data integrity scan failed", "error", err)
		}
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "data integrity scan timed out; no data was changed"})
			return
		}
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "data integrity scan unavailable; no data was changed"})
		return
	}
	writeJSON(w, http.StatusOK, report)
}
