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
	mux.HandleFunc("POST /internal/jobs/auth-token-retention", s.runAuthTokenRetention)
	mux.HandleFunc("POST /internal/jobs/notification-retention", s.runNotificationRetention)
	mux.HandleFunc("POST /internal/jobs/failed-task-retention", s.runFailedTaskRetention)
	mux.HandleFunc("POST /internal/jobs/notification-digest", s.runNotificationDigest)
	mux.HandleFunc("GET /internal/exports/users.csv", s.exportUsersCSV)
	mux.HandleFunc("GET /internal/exports/reports.csv", s.exportReportsCSV)
	mux.HandleFunc("POST /internal/reports/sales-insights", s.getSalesInsights)
	mux.HandleFunc("POST /internal/outbox/execute-event", s.executeOutboxEvent)
	mux.HandleFunc("POST /internal/jobs/activity-buffer-flush", s.runActivityBufferFlush)
	mux.HandleFunc("POST /internal/jobs/views-buffer-flush", s.runViewsBufferFlush)
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

func TestAuthTokenRetentionEndpointRejectsMissingOrInvalidAuthorization(t *testing.T) {
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
			req := httptest.NewRequest(http.MethodPost, "/internal/jobs/auth-token-retention", strings.NewReader(`{}`))
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

func TestAuthTokenRetentionEndpointRejectsNonEmptyOrInvalidBodies(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{name: "empty body", body: ``},
		{name: "null body", body: `null`},
		{name: "array body", body: `[]`},
		{name: "non-empty object", body: `{"retentionDays":30}`},
		{name: "invalid JSON", body: `{`},
		{name: "multiple JSON values", body: `{} {}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/jobs/auth-token-retention", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer test-secret")
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
			}
		})
	}
}

func TestNotificationRetentionEndpointRejectsMissingOrInvalidAuthorization(t *testing.T) {
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
			req := httptest.NewRequest(http.MethodPost, "/internal/jobs/notification-retention", strings.NewReader(`{"retentionDays":90}`))
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

func TestNotificationRetentionEndpointRejectsInvalidBodiesBeforeDatabaseAccess(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{name: "empty body", body: ``},
		{name: "invalid JSON", body: `{`},
		{name: "unknown field", body: `{"retentionDays":90,"unexpected":true}`},
		{name: "multiple JSON values", body: `{"retentionDays":90} {}`},
		{name: "zero retention", body: `{"retentionDays":0}`},
		{name: "retention too high", body: `{"retentionDays":3651}`},
		{name: "wrong type", body: `{"retentionDays":"90"}`},
		{name: "oversized body", body: `{"padding":"` + strings.Repeat("x", 2048) + `"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/jobs/notification-retention", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer test-secret")
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
			}
		})
	}
}

func TestFailedTaskRetentionEndpointRejectsMissingOrInvalidAuthorization(t *testing.T) {
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
			req := httptest.NewRequest(http.MethodPost, "/internal/jobs/failed-task-retention", strings.NewReader(`{"retentionDays":30}`))
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

func TestFailedTaskRetentionEndpointRejectsInvalidBodiesBeforeDatabaseAccess(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{name: "empty body", body: ``},
		{name: "invalid JSON", body: `{`},
		{name: "unknown field", body: `{"retentionDays":30,"unexpected":true}`},
		{name: "multiple JSON values", body: `{"retentionDays":30} {}`},
		{name: "zero retention", body: `{"retentionDays":0}`},
		{name: "retention too high", body: `{"retentionDays":3651}`},
		{name: "wrong type", body: `{"retentionDays":"30"}`},
		{name: "oversized body", body: `{"padding":"` + strings.Repeat("x", 2048) + `"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/jobs/failed-task-retention", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer test-secret")
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
			}
		})
	}
}

func TestNotificationDigestEndpointRejectsMissingOrInvalidAuthorization(t *testing.T) {
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
			req := httptest.NewRequest(http.MethodPost, "/internal/jobs/notification-digest", strings.NewReader(`{}`))
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

func TestNotificationDigestEndpointRejectsNonEmptyOrInvalidBodies(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{name: "empty body", body: ``},
		{name: "null body", body: `null`},
		{name: "array body", body: `[]`},
		{name: "non-empty object", body: `{"batchSize":10}`},
		{name: "invalid JSON", body: `{`},
		{name: "multiple JSON values", body: `{} {}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/jobs/notification-digest", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer test-secret")
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
			}
		})
	}
}

func TestLocalJobGatePreventsConcurrentSameJobButAllowsDifferentJobs(t *testing.T) {
	s := &server{}

	release, acquired := s.tryLocalJobGate(731904281)
	if !acquired {
		t.Fatal("first job gate acquisition failed")
	}
	if _, acquired := s.tryLocalJobGate(731904281); acquired {
		t.Fatal("same job gate should reject a concurrent request")
	}
	otherRelease, acquired := s.tryLocalJobGate(731904282)
	if !acquired {
		t.Fatal("different job should be allowed to acquire its own gate")
	}
	otherRelease()
	release()

	thirdRelease, acquired := s.tryLocalJobGate(731904281)
	if !acquired {
		t.Fatal("job gate should be available after release")
	}
	thirdRelease()
}

func TestAdminExportEndpointsRejectMissingOrInvalidAuthorization(t *testing.T) {
	paths := []string{
		"/internal/exports/users.csv",
		"/internal/exports/reports.csv",
	}
	headers := []string{"", "Bearer wrong", "Basic test-secret", "Bearer "}
	for _, path := range paths {
		for _, header := range headers {
			req := httptest.NewRequest(http.MethodGet, path, nil)
			if header != "" {
				req.Header.Set("Authorization", header)
			}
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusUnauthorized {
				t.Fatalf("%s with header %q: status = %d, want %d", path, header, recorder.Code, http.StatusUnauthorized)
			}
		}
	}
}

func TestSalesInsightsEndpointRejectsMissingOrInvalidAuthorization(t *testing.T) {
	headers := []string{"", "Bearer wrong", "Basic test-secret", "Bearer "}
	for _, header := range headers {
		req := httptest.NewRequest(http.MethodPost, "/internal/reports/sales-insights", strings.NewReader(`{"userId":"seller-1"}`))
		if header != "" {
			req.Header.Set("Authorization", header)
		}
		recorder := httptest.NewRecorder()
		testHandler().ServeHTTP(recorder, req)
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("header %q: status = %d, want %d", header, recorder.Code, http.StatusUnauthorized)
		}
	}
}

func TestSalesInsightsEndpointRejectsMalformedAndUnexpectedBodies(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{name: "empty", body: ``},
		{name: "invalid json", body: `{`},
		{name: "missing user", body: `{}`},
		{name: "unexpected field", body: `{"userId":"seller-1","role":"ADMIN"}`},
		{name: "multiple values", body: `{"userId":"seller-1"} {}`},
		{name: "too long", body: `{"userId":"` + strings.Repeat("x", 129) + `"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/reports/sales-insights", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer test-secret")
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
			}
		})
	}
}

func TestOutboxEventEndpointRejectsMissingAuthorization(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/internal/outbox/execute-event", strings.NewReader(`{"eventId":"evt_1","workerId":"worker-1"}`))
	recorder := httptest.NewRecorder()
	testHandler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

func TestOutboxEventEndpointRejectsMalformedOrUnexpectedBodiesBeforeDatabaseAccess(t *testing.T) {
	cases := []struct{ name, body string }{
		{name: "empty", body: ``},
		{name: "null", body: `null`},
		{name: "missing worker", body: `{"eventId":"evt_1"}`},
		{name: "unknown field", body: `{"eventId":"evt_1","workerId":"w","payload":{}}`},
		{name: "multiple values", body: `{"eventId":"evt_1","workerId":"w"} {}`},
		{name: "oversized", body: `{"eventId":"` + strings.Repeat("x", 17000) + `","workerId":"w"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/outbox/execute-event", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer test-secret")
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
			}
		})
	}
}

func TestBufferFlushEndpointsRejectMissingAuthorization(t *testing.T) {
	for _, path := range []string{
		"/internal/jobs/activity-buffer-flush",
		"/internal/jobs/views-buffer-flush",
	} {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{}`))
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
			}
		})
	}
}

func TestBufferFlushEndpointsRejectMalformedBodiesBeforeDatabaseAccess(t *testing.T) {
	for _, path := range []string{
		"/internal/jobs/activity-buffer-flush",
		"/internal/jobs/views-buffer-flush",
	} {
		t.Run(path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, path, strings.NewReader(`{"unexpected":true}`))
			req.Header.Set("Authorization", "Bearer test-secret")
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
			}
		})
	}
}
