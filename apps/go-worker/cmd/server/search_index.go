package main

import (
	"context"
	"errors"
	"net/http"
	"time"

	"marketplat/apps/go-worker/internal/searchindex"
)

const (
	searchIndexRefreshInterval = 10 * time.Minute
	searchIndexRefreshTimeout  = 5 * time.Minute
)

func (s *server) runSearchIndexRefresh(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if !requireEmptyJSONObject(w, r, 1024) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), searchIndexRefreshTimeout)
	defer cancel()
	result, err := searchindex.Refresh(ctx, s.db)
	if err != nil {
		if s.logger != nil {
			s.logger.Error("search suggestion index refresh failed", "error", err)
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "search suggestion index refresh failed"})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) searchIndexStatus(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 2*time.Second)
	defer cancel()
	status, err := searchindex.ReadStatus(ctx, s.db)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "search index status timed out"})
			return
		}
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "search suggestion index is not installed or unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"enabled":                s.searchIndexEnabled,
		"fresh":                  status.Fresh,
		"refreshedAt":            status.RefreshedAt,
		"indexedRows":            status.IndexedRows,
		"durationMillis":         status.DurationMillis,
		"lastError":              status.LastError,
		"refreshIntervalSeconds": int(searchIndexRefreshInterval / time.Second),
	})
}

func (s *server) runSearchIndexWorker(ctx context.Context) {
	ticker := time.NewTicker(searchIndexRefreshInterval)
	defer ticker.Stop()

	refresh := func() {
		runCtx, cancel := context.WithTimeout(ctx, searchIndexRefreshTimeout)
		defer cancel()
		result, err := searchindex.Refresh(runCtx, s.db)
		if err != nil {
			if s.logger != nil {
				s.logger.Error("background search suggestion index refresh failed", "error", err)
			}
			return
		}
		if s.logger != nil {
			if result.SkippedLocked {
				s.logger.Info("background search index refresh skipped; another instance owns the advisory lock")
			} else if result.Refreshed {
				s.logger.Info("background search suggestion index refreshed", "indexedRows", result.IndexedRows, "durationMillis", result.DurationMillis)
			}
		}
	}

	// Refresh once on startup so a new deployment does not wait for the first
	// ticker interval. The old materialized-view generation remains readable
	// until PostgreSQL publishes the new one.
	refresh()
	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			refresh()
		}
	}
}
