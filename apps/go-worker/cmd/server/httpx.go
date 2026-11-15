package main

import (
	"crypto/subtle"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
)

// authorized validates the internal bearer token with a constant-time compare.
func authorized(r *http.Request, expected string) bool {
	provided := strings.TrimSpace(strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer "))
	return provided != "" && strings.HasPrefix(r.Header.Get("Authorization"), "Bearer ") && subtle.ConstantTimeCompare([]byte(provided), []byte(expected)) == 1
}

func writeJSON(w http.ResponseWriter, status int, value any) {
	w.Header().Set("Content-Type", "application/json; charset=utf-8")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(value)
}

// writeError sends the worker's standard {"error": "..."} envelope.
func writeError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]string{"error": message})
}

func securityHeaders(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("Cache-Control", "no-store")
		next.ServeHTTP(w, r)
	})
}

// decodeStrictJSON reads exactly one JSON value into dst. Unknown fields,
// oversized bodies and trailing JSON values are rejected with a 400 response;
// the caller only needs to return when it reports false.
func decodeStrictJSON(w http.ResponseWriter, r *http.Request, maxBytes int64, dst any, invalidMessage string) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(dst); err != nil {
		writeError(w, http.StatusBadRequest, invalidMessage)
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeError(w, http.StatusBadRequest, "request body must contain one JSON object")
		return false
	}
	return true
}

// decodeRetentionDays parses the optional {"retentionDays": n} body shared by
// the retention jobs and validates it against [1, maxDays].
func decodeRetentionDays(w http.ResponseWriter, r *http.Request, defaultDays, maxDays int) (int, bool) {
	var request struct {
		RetentionDays *int `json:"retentionDays"`
	}
	if !decodeStrictJSON(w, r, 1024, &request, "invalid request body") {
		return 0, false
	}
	days := defaultDays
	if request.RetentionDays != nil {
		days = *request.RetentionDays
	}
	if days < 1 || days > maxDays {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("retentionDays must be between 1 and %d", maxDays))
		return 0, false
	}
	return days, true
}

// requireEmptyJSONObject accepts only `{}` as the request body. Endpoints whose
// policy is defined in code use it so callers cannot supply divergent input.
func requireEmptyJSONObject(w http.ResponseWriter, r *http.Request, maxBytes int64) bool {
	decoder := json.NewDecoder(http.MaxBytesReader(w, r.Body, maxBytes))
	decoder.DisallowUnknownFields()
	var body map[string]json.RawMessage
	if err := decoder.Decode(&body); err != nil || body == nil || len(body) != 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must be an empty JSON object"})
		return false
	}
	if err := decoder.Decode(&struct{}{}); err != io.EOF {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "request body must contain one JSON object"})
		return false
	}
	return true
}
