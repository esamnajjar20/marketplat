package main

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"time"

	"marketplat/apps/go-worker/internal/adminexport"
	"marketplat/apps/go-worker/internal/salesexport"
)

type csvWriter func(context.Context, io.Writer) error

func (s *server) exportUsersCSV(w http.ResponseWriter, r *http.Request) {
	s.streamCSV(w, r, "users.csv", func(ctx context.Context, dst io.Writer) error {
		return adminexport.WriteUsersCSV(ctx, s.db, dst)
	})
}

func (s *server) exportReportsCSV(w http.ResponseWriter, r *http.Request) {
	s.streamCSV(w, r, "reports.csv", func(ctx context.Context, dst io.Writer) error {
		return adminexport.WriteReportsCSV(ctx, s.db, dst)
	})
}

func (s *server) exportSalesCSV(w http.ResponseWriter, r *http.Request) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}
	var payload struct {
		UserID  string `json:"userId"`
		StoreID string `json:"storeId"`
		Status  string `json:"status"`
		From    string `json:"from"`
		To      string `json:"to"`
		Limit   string `json:"limit"`
	}
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, 8*1024))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid sales export request"})
		return
	}
	var trailing any
	if err := decoder.Decode(&trailing); !errors.Is(err, io.EOF) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid sales export request"})
		return
	}
	values := url.Values{
		"userId":  {payload.UserID},
		"storeId": {payload.StoreID},
		"status":  {payload.Status},
		"from":    {payload.From},
		"to":      {payload.To},
		"limit":   {payload.Limit},
	}
	options, err := salesexport.ParseOptions(values)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid sales export parameters"})
		return
	}
	s.streamCSV(w, r, "sales-report.csv", func(ctx context.Context, dst io.Writer) error {
		return salesexport.WriteCSV(ctx, s.db, dst, options)
	})
}

// streamCSV completes the bounded database query into a temporary file
// before sending response headers. This lets Express safely fall back if Go's
// DB query fails, without ever mixing two partial CSV bodies in one response.
func (s *server) streamCSV(w http.ResponseWriter, r *http.Request, filename string, writeCSV csvWriter) {
	if !authorized(r, s.token) {
		writeError(w, http.StatusUnauthorized, "unauthorized")
		return
	}

	file, err := os.CreateTemp("", "marketplat-admin-export-*.csv")
	if err != nil {
		s.logger.Error("admin CSV temporary file creation failed", "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "export temporarily unavailable"})
		return
	}
	filePath := file.Name()
	defer os.Remove(filePath)
	defer file.Close()

	ctx, cancel := context.WithTimeout(r.Context(), 13*time.Second)
	defer cancel()
	buffered := bufio.NewWriterSize(file, 32*1024)
	if err := writeCSV(ctx, buffered); err != nil {
		s.logger.Error("admin CSV generation failed", "filename", filename, "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "export temporarily unavailable"})
		return
	}
	if err := buffered.Flush(); err != nil {
		s.logger.Error("admin CSV flush failed", "filename", filename, "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "export temporarily unavailable"})
		return
	}
	if err := file.Sync(); err != nil {
		s.logger.Error("admin CSV sync failed", "filename", filename, "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "export temporarily unavailable"})
		return
	}
	info, err := file.Stat()
	if err != nil {
		s.logger.Error("admin CSV stat failed", "filename", filename, "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "export temporarily unavailable"})
		return
	}
	if _, err := file.Seek(0, io.SeekStart); err != nil {
		s.logger.Error("admin CSV rewind failed", "filename", filename, "error", err)
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "export temporarily unavailable"})
		return
	}

	w.Header().Set("Content-Type", "text/csv; charset=utf-8")
	w.Header().Set("Content-Disposition", `attachment; filename="`+filename+`"`)
	w.Header().Set("Content-Length", strconv.FormatInt(info.Size(), 10))
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Content-Type-Options", "nosniff")
	w.WriteHeader(http.StatusOK)
	if _, err := io.Copy(w, file); err != nil {
		s.logger.Warn("admin CSV stream interrupted", "filename", filename, "error", err)
	}
}
