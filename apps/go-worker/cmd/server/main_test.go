package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func testHandler() http.Handler {
	s := &server{token: "test-secret", retentionDays: 90, batchSize: 5000}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("POST /internal/jobs/analytics-retention", s.runAnalyticsRetention)
	return securityHeaders(mux)
}

func TestRetentionEndpointRejectsMissingOrInvalidAuthorization(t *testing.T) {
	cases := []struct {
		name   string
		header string
	}{
		{name: "missing"},
		{name: "wrong token", header: "Bearer wrong"},
		{name: "wrong scheme", header: "Basic test-secret"},
		{name: "empty bearer", header: "Bearer "},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/jobs/analytics-retention", strings.NewReader(`{"retentionDays":30}`))
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
			}
		})
	}
}

func TestRetentionEndpointRejectsInvalidBodiesBeforeDatabaseAccess(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{name: "empty body", body: ``},
		{name: "invalid JSON", body: `{`},
		{name: "unknown field", body: `{"retentionDays":30,"unexpected":true}`},
		{name: "multiple JSON values", body: `{"retentionDays":30} {"retentionDays":31}`},
		{name: "zero retention", body: `{"retentionDays":0}`},
		{name: "retention too high", body: `{"retentionDays":3651}`},
		{name: "wrong type", body: `{"retentionDays":"30"}`},
		{name: "oversized body", body: `{"padding":"` + strings.Repeat("x", 2048) + `"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/jobs/analytics-retention", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer test-secret")
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
			}
		})
	}
}

func TestWorkerSecurityHeadersAreSet(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/missing", nil)
	recorder := httptest.NewRecorder()
	securityHeaders(http.NotFoundHandler()).ServeHTTP(recorder, req)
	if got := recorder.Header().Get("X-Content-Type-Options"); got != "nosniff" {
		t.Fatalf("X-Content-Type-Options = %q, want nosniff", got)
	}
	if got := recorder.Header().Get("Cache-Control"); got != "no-store" {
		t.Fatalf("Cache-Control = %q, want no-store", got)
	}
}

func TestEnvIntRejectsMalformedConfiguration(t *testing.T) {
	t.Setenv("MARKETPLAT_TEST_INT", "not-a-number")
	if _, err := envInt("MARKETPLAT_TEST_INT", 90); err == nil {
		t.Fatal("expected malformed integer environment value to fail")
	}
}

func TestEnvIntUsesFallbackWhenUnsetOrBlank(t *testing.T) {
	t.Setenv("MARKETPLAT_TEST_INT", "   ")
	got, err := envInt("MARKETPLAT_TEST_INT", 90)
	if err != nil {
		t.Fatalf("envInt returned unexpected error: %v", err)
	}
	if got != 90 {
		t.Fatalf("envInt = %d, want fallback 90", got)
	}
}
