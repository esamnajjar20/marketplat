package main

import (
	"context"
	"errors"
	"net/http"
	"time"

	"marketplat/apps/go-worker/internal/fraudmonitor"
)

const fraudMonitorScanTimeout = 22 * time.Second

func (s *server) runFraudMonitorScan(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if !requireEmptyJSONObject(w, r, 1024) {
		return
	}

	ctx, cancel := context.WithTimeout(r.Context(), fraudMonitorScanTimeout)
	defer cancel()
	report, err := fraudmonitor.Scan(ctx, s.db)
	if err != nil {
		if errors.Is(err, fraudmonitor.ErrAlreadyRunning) {
			writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
			return
		}
		if s.logger != nil {
			s.logger.Error("fraud monitor scan failed", "error", err)
		}
		if errors.Is(err, context.DeadlineExceeded) || errors.Is(ctx.Err(), context.DeadlineExceeded) {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "fraud monitor scan timed out; no data was changed"})
			return
		}
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "fraud monitor scan unavailable; no data was changed"})
		return
	}
	writeJSON(w, http.StatusOK, report)
}
