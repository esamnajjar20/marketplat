package main

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"strings"
	"time"

	"marketplat/apps/go-worker/internal/inventorymonitor"
)

func (s *server) getInventoryStoreSummary(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	var request struct {
		StoreID string `json:"storeId"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&request); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid inventory summary request"})
		return
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must contain one JSON object"})
		return
	}
	request.StoreID = strings.TrimSpace(request.StoreID)
	if request.StoreID == "" || len(request.StoreID) > 128 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "storeId is required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	result, err := inventorymonitor.GetStoreSummary(ctx, s.db, request.StoreID)
	if err != nil {
		if s.logger != nil {
			s.logger.Warn("inventory store summary failed", "error", err)
		}
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "inventory summary unavailable"})
		return
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) runInventoryMonitor(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeJSON(w, http.StatusUnauthorized, map[string]string{"error": "unauthorized"})
		return
	}
	if !requireEmptyJSONObject(w, r, 1024) {
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 22*time.Second)
	defer cancel()
	result, err := inventorymonitor.RunLowStockAlerts(ctx, s.db)
	if err != nil {
		if s.logger != nil {
			s.logger.Error("inventory monitor job failed", "error", err)
		}
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "inventory monitor unavailable"})
		return
	}
	if !result.LockAcquired {
		writeJSON(w, http.StatusConflict, map[string]string{"status": "already-running"})
		return
	}
	if s.logger != nil {
		s.logger.Info("inventory monitor completed",
			"candidatesScanned", result.CandidatesScanned,
			"eventsClaimed", result.EventsClaimed,
			"notificationsCreated", result.NotificationsCreated,
			"pushDispatchesCreated", result.PushDispatchesCreated,
		)
	}
	writeJSON(w, http.StatusOK, result)
}

func (s *server) publishInventoryNotifications(ctx context.Context, apiBaseURL string, notificationIDs []string) error {
	if len(notificationIDs) == 0 {
		return nil
	}
	if len(notificationIDs) > inventorymonitor.CandidateLimit {
		return errors.New("inventory monitor returned too many notification IDs")
	}
	body, err := json.Marshal(map[string][]string{"notificationIds": notificationIDs})
	if err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, apiBaseURL+"/internal/go-worker/publish-durable-notifications", strings.NewReader(string(body)))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+s.token)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	client := &http.Client{Timeout: 5 * time.Second, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
	response, err := client.Do(req)
	if err != nil {
		return err
	}
	defer response.Body.Close()
	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return errors.New("API durable notification publisher returned non-success status")
	}
	return nil
}
