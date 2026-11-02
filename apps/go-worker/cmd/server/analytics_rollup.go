package main

import (
	"context"
	"net/http"
	"time"

	"marketplat/apps/go-worker/internal/analyticsrollup"
)

const analyticsRollupTimeout = 12 * time.Minute

func (s *server) runAnalyticsRollup(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if !requireEmptyJSONObject(w, r, 1024) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), analyticsRollupTimeout)
	defer cancel()
	result, err := s.executeAnalyticsRollup(ctx)
	if err != nil {
		if s.logger != nil {
			s.logger.Error("analytics daily rollup failed", "error", err)
		}
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": "analytics daily rollup failed"})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) analyticsRollupConfig() analyticsrollup.Config {
	config := analyticsrollup.DefaultConfig()
	if s.retentionDays > 0 {
		config.RawWindowDays = s.retentionDays
		if config.RetentionDays < s.retentionDays {
			config.RetentionDays = s.retentionDays
		}
	}
	return config
}

func (s *server) executeAnalyticsRollup(ctx context.Context) (analyticsrollup.Result, error) {
	result, err := analyticsrollup.Run(ctx, s.db, time.Now().UTC(), s.analyticsRollupConfig())
	if err != nil {
		return result, err
	}
	if s.logger != nil {
		s.logger.Info("analytics daily rollup completed",
			"plannedDays", result.PlannedDays,
			"rebuiltDays", result.RebuiltDays,
			"skippedDays", result.SkippedDays,
			"sourceEvents", result.SourceEvents,
			"rollupRows", result.RollupRows,
			"prunedDays", result.PrunedDays,
			"prunedRows", result.PrunedRows,
		)
	}
	return result, nil
}
