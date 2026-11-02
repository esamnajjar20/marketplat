package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"marketplat/apps/go-worker/internal/rediswire"
)

func testHandler() http.Handler {
	s := &server{token: "test-secret", retentionDays: 90, batchSize: 5000}
	mux := http.NewServeMux()
	mux.HandleFunc("GET /healthz", s.health)
	mux.HandleFunc("GET /internal/diagnostics", s.internalDiagnostics)
	mux.HandleFunc("POST /internal/integrity/scan", s.runDataIntegrityScan)
	mux.HandleFunc("POST /internal/fraud/monitor/scan", s.runFraudMonitorScan)
	mux.HandleFunc("POST /internal/inventory/store-summary", s.getInventoryStoreSummary)
	mux.HandleFunc("POST /internal/jobs/inventory-monitor", s.runInventoryMonitor)
	mux.HandleFunc("POST /internal/analytics/events", s.ingestAnalyticsEvents)
	mux.HandleFunc("POST /internal/analytics/summary", s.getAnalyticsSummary)
	mux.HandleFunc("POST /internal/jobs/analytics-rollup", s.runAnalyticsRollup)
	mux.HandleFunc("POST /internal/jobs/search-index-refresh", s.runSearchIndexRefresh)
	mux.HandleFunc("GET /internal/search/index-status", s.searchIndexStatus)
	mux.HandleFunc("POST /internal/jobs/analytics-retention", s.runAnalyticsRetention)
	mux.HandleFunc("POST /internal/jobs/auth-token-retention", s.runAuthTokenRetention)
	mux.HandleFunc("POST /internal/jobs/notification-retention", s.runNotificationRetention)
	mux.HandleFunc("POST /internal/jobs/failed-task-retention", s.runFailedTaskRetention)
	mux.HandleFunc("POST /internal/jobs/notification-digest", s.runNotificationDigest)
	mux.HandleFunc("GET /internal/exports/users.csv", s.exportUsersCSV)
	mux.HandleFunc("GET /internal/exports/reports.csv", s.exportReportsCSV)
	mux.HandleFunc("POST /internal/reports/sales-insights", s.getSalesInsights)
	mux.HandleFunc("POST /internal/outbox/execute-event", s.executeOutboxEvent)
	mux.HandleFunc("GET /internal/outbox/worker-status", s.outboxWorkerStatus)
	mux.HandleFunc("POST /internal/scheduler/run-due", s.runDueScheduledJobs)
	mux.HandleFunc("POST /internal/push/fcm/send", s.sendFcmPush)
	mux.HandleFunc("GET /internal/push/dispatch/worker-status", s.pushDispatchWorkerStatus)
	mux.HandleFunc("POST /internal/jobs/activity-buffer-flush", s.runActivityBufferFlush)
	mux.HandleFunc("POST /internal/jobs/views-buffer-flush", s.runViewsBufferFlush)
	mux.HandleFunc("POST /internal/jobs/expire-open-requests", s.runExpireOpenRequests)
	mux.HandleFunc("POST /internal/jobs/demote-stale-boosts", s.runDemoteStaleBoosts)
	mux.HandleFunc("POST /internal/jobs/expire-service-requests", s.runExpireServiceRequests)
	mux.HandleFunc("POST /internal/jobs/expire-ads", s.runExpireAds)
	mux.HandleFunc("POST /internal/jobs/promotion-lifecycle", s.runPromotionLifecycle)
	mux.HandleFunc("POST /internal/jobs/cleanup-expired-stories", s.runCleanupExpiredStories)
	mux.HandleFunc("POST /internal/jobs/cleanup-media-assets", s.runCleanupMediaAssets)
	mux.HandleFunc("GET /internal/media/cleanup/status", s.mediaCleanupStatus)
	return securityHeaders(mux)
}

func TestInventoryEndpointsRequireAuthorization(t *testing.T) {
	cases := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "store summary", method: http.MethodPost, path: "/internal/inventory/store-summary", body: `{"storeId":"store_1"}`},
		{name: "low stock monitor", method: http.MethodPost, path: "/internal/jobs/inventory-monitor", body: `{}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
			}
		})
	}
}

func TestInventoryStoreSummaryRejectsInvalidBodiesBeforeDatabaseAccess(t *testing.T) {
	for _, body := range []string{"", `null`, `[]`, `{"unexpected":true}`, `{"storeId":"store_1"} {}`, `{"storeId":""}`} {
		req := httptest.NewRequest(http.MethodPost, "/internal/inventory/store-summary", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer test-secret")
		recorder := httptest.NewRecorder()
		testHandler().ServeHTTP(recorder, req)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("body %q: status = %d, want %d; response=%s", body, recorder.Code, http.StatusBadRequest, recorder.Body.String())
		}
	}
}

func TestInventoryHandlersHandleMissingDatabaseWithoutPanic(t *testing.T) {
	cases := []struct {
		path string
		body string
	}{
		{path: "/internal/inventory/store-summary", body: `{"storeId":"store_1"}`},
		{path: "/internal/jobs/inventory-monitor", body: `{}`},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(tc.body))
		req.Header.Set("Authorization", "Bearer test-secret")
		recorder := httptest.NewRecorder()
		testHandler().ServeHTTP(recorder, req)
		if recorder.Code != http.StatusServiceUnavailable {
			t.Fatalf("%s: status = %d, want %d; response=%s", tc.path, recorder.Code, http.StatusServiceUnavailable, recorder.Body.String())
		}
		if strings.Contains(strings.ToLower(recorder.Body.String()), "database is required") {
			t.Fatalf("%s: internal error details must not be exposed", tc.path)
		}
	}
}

func TestSearchIndexEndpointsRequireAuthorization(t *testing.T) {
	cases := []struct {
		name   string
		method string
		path   string
		body   string
	}{
		{name: "status", method: http.MethodGet, path: "/internal/search/index-status"},
		{name: "refresh", method: http.MethodPost, path: "/internal/jobs/search-index-refresh", body: `{}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
			}
		})
	}
}

func TestSearchIndexRefreshRejectsInvalidBodyBeforeDatabaseAccess(t *testing.T) {
	for _, body := range []string{``, `null`, `[]`, `{"unexpected":true}`, `{} {}`} {
		req := httptest.NewRequest(http.MethodPost, "/internal/jobs/search-index-refresh", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer test-secret")
		recorder := httptest.NewRecorder()
		testHandler().ServeHTTP(recorder, req)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("body %q: status = %d, want %d; response=%s", body, recorder.Code, http.StatusBadRequest, recorder.Body.String())
		}
	}
}

func TestOutboxWorkerStatusRequiresAuthorization(t *testing.T) {
	cases := []struct {
		name   string
		header string
	}{
		{name: "missing"},
		{name: "wrong token", header: "Bearer wrong"},
		{name: "wrong scheme", header: "Basic test-secret"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/internal/outbox/worker-status", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			recorder := httptest.NewRecorder()
			server := &server{token: "test-secret", outboxEnabled: false}
			server.outboxWorkerStatus(recorder, req)
			if recorder.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
			}
		})
	}
}

func TestOutboxWorkerStatusReportsDisabledWithoutDatabaseAccess(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/internal/outbox/worker-status", nil)
	req.Header.Set("Authorization", "Bearer test-secret")
	recorder := httptest.NewRecorder()
	server := &server{token: "test-secret", outboxEnabled: false}
	server.outboxWorkerStatus(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if !strings.Contains(recorder.Body.String(), `"enabled":false`) {
		t.Fatalf("expected disabled status, got %s", recorder.Body.String())
	}
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

func TestExpireOpenRequestsEndpointRequiresAuthorization(t *testing.T) {
	for _, header := range []string{"", "Bearer wrong", "Basic test-secret", "Bearer "} {
		req := httptest.NewRequest(http.MethodPost, "/internal/jobs/expire-open-requests", strings.NewReader(`{}`))
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

func TestExpireOpenRequestsEndpointRejectsMalformedBodiesBeforeDatabaseAccess(t *testing.T) {
	for _, body := range []string{"", `{`, `null`, `[]`, `{"unexpected":true}`, `{} {}`, `{"padding":"` + strings.Repeat("x", 2048) + `"}`} {
		req := httptest.NewRequest(http.MethodPost, "/internal/jobs/expire-open-requests", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer test-secret")
		recorder := httptest.NewRecorder()
		testHandler().ServeHTTP(recorder, req)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("body %q: status = %d, want %d; response=%s", body, recorder.Code, http.StatusBadRequest, recorder.Body.String())
		}
	}
}

func TestDemoteStaleBoostsEndpointRequiresAuthorization(t *testing.T) {
	for _, header := range []string{"", "Bearer wrong", "Basic test-secret", "Bearer "} {
		req := httptest.NewRequest(http.MethodPost, "/internal/jobs/demote-stale-boosts", strings.NewReader(`{"staleBoostDays":60}`))
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

func TestDemoteStaleBoostsEndpointRejectsInvalidBodiesBeforeDatabaseAccess(t *testing.T) {
	for _, body := range []string{
		"", `{`, `null`, `[]`, `{"unexpected":true}`, `{"staleBoostDays":0}`,
		`{"staleBoostDays":3651}`, `{"staleBoostDays":"60"}`, `{"dryRun":"true"}`,
		`{"staleBoostDays":60} {}`, `{"padding":"` + strings.Repeat("x", 2048) + `"}`,
	} {
		req := httptest.NewRequest(http.MethodPost, "/internal/jobs/demote-stale-boosts", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer test-secret")
		recorder := httptest.NewRecorder()
		testHandler().ServeHTTP(recorder, req)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("body %q: status = %d, want %d; response=%s", body, recorder.Code, http.StatusBadRequest, recorder.Body.String())
		}
	}
}

func TestServiceRequestExpiryEndpointRejectsMissingAuthorization(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/internal/jobs/expire-service-requests", strings.NewReader(`{}`))
	recorder := httptest.NewRecorder()
	testHandler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

func TestServiceRequestExpiryEndpointRequiresEmptyJSONBody(t *testing.T) {
	for _, body := range []string{``, `null`, `[]`, `{"ttlDays":30}`, `{} {}`} {
		req := httptest.NewRequest(http.MethodPost, "/internal/jobs/expire-service-requests", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer test-secret")
		recorder := httptest.NewRecorder()
		testHandler().ServeHTTP(recorder, req)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("body %q: status = %d, want %d; body=%s", body, recorder.Code, http.StatusBadRequest, recorder.Body.String())
		}
	}
}

func TestAdExpiryEndpointRejectsMissingAuthorization(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/internal/jobs/expire-ads", strings.NewReader(`{}`))
	recorder := httptest.NewRecorder()
	testHandler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusUnauthorized {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
	}
}

func TestAdExpiryEndpointRequiresEmptyJSONBody(t *testing.T) {
	for _, body := range []string{``, `null`, `[]`, `{"batchSize":100}`, `{} {}`} {
		req := httptest.NewRequest(http.MethodPost, "/internal/jobs/expire-ads", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer test-secret")
		recorder := httptest.NewRecorder()
		testHandler().ServeHTTP(recorder, req)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("body %q: status = %d, want %d; body=%s", body, http.StatusBadRequest, recorder.Code, recorder.Body.String())
		}
	}
}

func TestNewLifecycleEndpointsRequireBearerAuthorization(t *testing.T) {
	for _, path := range []string{
		"/internal/jobs/promotion-lifecycle",
		"/internal/jobs/cleanup-expired-stories",
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

func TestStoryCleanupEndpointFallsBackWhenGoCloudinaryCredentialsAreMissing(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/internal/jobs/cleanup-expired-stories", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer test-secret")
	recorder := httptest.NewRecorder()
	testHandler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusServiceUnavailable, recorder.Body.String())
	}
}

func TestFcmPushEndpointRequiresInternalAuthorization(t *testing.T) {
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
			req := httptest.NewRequest(http.MethodPost, "/internal/push/fcm/send", strings.NewReader(`{"userId":"user","targetId":"device","payload":{"title":"Hello","body":"World"}}`))
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

func TestFcmPushEndpointRejectsInvalidBodiesBeforeDatabaseAccess(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{name: "invalid JSON", body: `{`},
		{name: "unknown field", body: `{"userId":"user","targetId":"device","payload":{"title":"Hello","body":"World","token":"must-not-be-accepted"}}`},
		{name: "multiple JSON values", body: `{"userId":"user","targetId":"device","payload":{"title":"Hello","body":"World"}} {}`},
		{name: "missing target identity", body: `{"userId":"","targetId":"device","payload":{"title":"Hello","body":"World"}}`},
		{name: "missing title", body: `{"userId":"user","targetId":"device","payload":{"title":"","body":"World"}}`},
		{name: "oversized body", body: `{"userId":"user","targetId":"device","payload":{"title":"Hello","body":"` + strings.Repeat("x", 9*1024) + `"}}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/push/fcm/send", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer test-secret")
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
			}
		})
	}
}

func TestFcmPushEndpointReportsUnconfiguredWithoutQueryingDeviceToken(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/internal/push/fcm/send", strings.NewReader(`{"userId":"user","targetId":"device","payload":{"title":"Hello","body":"World"}}`))
	req.Header.Set("Authorization", "Bearer test-secret")
	recorder := httptest.NewRecorder()
	testHandler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"outcome":"unconfigured"`) {
		t.Fatalf("unexpected response: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
}

func TestInternalDiagnosticsRejectsMissingOrInvalidAuthorization(t *testing.T) {
	for _, header := range []string{"", "Bearer wrong", "Basic test-secret"} {
		req := httptest.NewRequest(http.MethodGet, "/internal/diagnostics", nil)
		if header != "" {
			req.Header.Set("Authorization", header)
		}
		recorder := httptest.NewRecorder()
		testHandler().ServeHTTP(recorder, req)
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("header %q: status=%d, want 401", header, recorder.Code)
		}
	}
}

func TestInternalDiagnosticsReportsDependencyAndMigrationReadinessWithoutSecrets(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/internal/diagnostics", nil)
	req.Header.Set("Authorization", "Bearer test-secret")
	recorder := httptest.NewRecorder()
	testHandler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status=%d, want 200; body=%s", recorder.Code, recorder.Body.String())
	}
	body := recorder.Body.String()
	for _, expected := range []string{`"postgres":"unhealthy"`, `"viewBatchLedger":"unknown"`, `"schedulerLedger":"unknown"`, `"firebaseCredentials":"missing"`} {
		if !strings.Contains(body, expected) {
			t.Fatalf("diagnostics response is missing %s: %s", expected, body)
		}
	}
	if strings.Contains(body, "test-secret") {
		t.Fatal("diagnostics response must not expose the internal token")
	}
}

func TestSameRedisConfig(t *testing.T) {
	primary := &rediswire.Config{Addr: "redis.example:6379", Username: "u", Password: "p", TLS: true, DB: 1}
	if !sameRedisConfig(primary, &rediswire.Config{Addr: "redis.example:6379", Username: "u", Password: "p", TLS: true, DB: 1}) {
		t.Fatal("equivalent Redis configurations should be recognized as the same dependency")
	}
	if sameRedisConfig(primary, &rediswire.Config{Addr: "redis.example:6379", Username: "u", Password: "different", TLS: true, DB: 1}) {
		t.Fatal("different Redis credentials must not be treated as the same dependency")
	}
	if !sameRedisConfig(nil, nil) {
		t.Fatal("two missing Redis configurations should be treated as the same dependency")
	}
}

func TestGoSchedulerRejectsMissingOrInvalidAuthorization(t *testing.T) {
	cases := []struct {
		name   string
		header string
	}{
		{name: "missing"},
		{name: "wrong token", header: "Bearer wrong"},
		{name: "wrong scheme", header: "Basic test-secret"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/scheduler/run-due", strings.NewReader(`{}`))
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

func TestGoSchedulerRejectsInvalidBodyBeforeDatabaseAccess(t *testing.T) {
	cases := []struct {
		name string
		body string
	}{
		{name: "empty body", body: ``},
		{name: "invalid JSON", body: `{`},
		{name: "non-empty object", body: `{"force":true}`},
		{name: "array", body: `[]`},
		{name: "multiple JSON values", body: `{} {}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/scheduler/run-due", strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer test-secret")
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
			}
		})
	}
}

func TestGoSchedulerRequiresAPIAdapterConfiguration(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/internal/scheduler/run-due", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer test-secret")
	recorder := httptest.NewRecorder()
	testHandler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusServiceUnavailable, recorder.Body.String())
	}
}

func TestNormalizeAPIBaseURLRequiresHTTPSForRemoteHosts(t *testing.T) {
	cases := []struct {
		input string
		valid bool
	}{
		{input: "https://api.example.com", valid: true},
		{input: "http://localhost:5000", valid: true},
		{input: "http://api.example.com", valid: false},
		{input: "https://user:pass@api.example.com", valid: false},
		{input: "https://api.example.com/path", valid: false},
		{input: "https://api.example.com?token=secret", valid: false},
	}
	for _, tc := range cases {
		_, err := normalizeAPIBaseURL(tc.input)
		if tc.valid && err != nil {
			t.Errorf("normalizeAPIBaseURL(%q) returned error: %v", tc.input, err)
		}
		if !tc.valid && err == nil {
			t.Errorf("normalizeAPIBaseURL(%q) unexpectedly succeeded", tc.input)
		}
	}
}

func TestPushDispatchWorkerStatusRequiresAuthorization(t *testing.T) {
	cases := []struct {
		name   string
		header string
	}{
		{name: "missing"},
		{name: "wrong token", header: "Bearer wrong"},
		{name: "wrong scheme", header: "Basic test-secret"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodGet, "/internal/push/dispatch/worker-status", nil)
			if tc.header != "" {
				req.Header.Set("Authorization", tc.header)
			}
			recorder := httptest.NewRecorder()
			s := &server{token: "test-secret", pushDispatchEnabled: true}
			s.pushDispatchWorkerStatus(recorder, req)
			if recorder.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
			}
		})
	}
}

func TestPushDispatchWorkerStatusOnlyEnablesAfterWorkerIsActive(t *testing.T) {
	t.Run("configured but not active", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/internal/push/dispatch/worker-status", nil)
		req.Header.Set("Authorization", "Bearer test-secret")
		recorder := httptest.NewRecorder()
		s := &server{token: "test-secret", pushDispatchEnabled: true}
		s.pushDispatchWorkerStatus(recorder, req)
		if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"enabled":false`) {
			t.Fatalf("expected disabled status before readiness, got %d %s", recorder.Code, recorder.Body.String())
		}
	})

	t.Run("active", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/internal/push/dispatch/worker-status", nil)
		req.Header.Set("Authorization", "Bearer test-secret")
		recorder := httptest.NewRecorder()
		s := &server{token: "test-secret", pushDispatchEnabled: true}
		s.pushDispatchActive.Store(true)
		s.pushDispatchWorkerStatus(recorder, req)
		if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"enabled":true`) {
			t.Fatalf("expected active status, got %d %s", recorder.Code, recorder.Body.String())
		}
	})

	t.Run("disabled even if stale active flag", func(t *testing.T) {
		req := httptest.NewRequest(http.MethodGet, "/internal/push/dispatch/worker-status", nil)
		req.Header.Set("Authorization", "Bearer test-secret")
		recorder := httptest.NewRecorder()
		s := &server{token: "test-secret", pushDispatchEnabled: false}
		s.pushDispatchActive.Store(true)
		s.pushDispatchWorkerStatus(recorder, req)
		if recorder.Code != http.StatusOK || !strings.Contains(recorder.Body.String(), `"enabled":false`) {
			t.Fatalf("expected disabled status, got %d %s", recorder.Code, recorder.Body.String())
		}
	})
}

func TestAnalyticsInternalEndpointsRequireAuthorization(t *testing.T) {
	paths := []struct {
		path string
		body string
	}{
		{path: "/internal/analytics/events", body: `{"events":[{"eventId":"evt-1","event":"PAGE_VIEW","sessionId":"s1"}]}`},
		{path: "/internal/analytics/summary", body: `{"from":"2026-01-01T00:00:00Z","to":"2026-01-02T00:00:00Z","bucket":"day"}`},
		{path: "/internal/jobs/analytics-rollup", body: `{}`},
	}
	for _, item := range paths {
		t.Run(item.path, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, item.path, strings.NewReader(item.body))
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusUnauthorized, recorder.Body.String())
			}
		})
	}
}

func TestAnalyticsEndpointsRejectInvalidInputBeforeDatabaseAccess(t *testing.T) {
	cases := []struct {
		name string
		path string
		body string
	}{
		{name: "empty events", path: "/internal/analytics/events", body: `{"events":[]}`},
		{name: "unknown ingest field", path: "/internal/analytics/events", body: `{"events":[],"admin":true}`},
		{name: "missing event ID", path: "/internal/analytics/events", body: `{"events":[{"event":"PAGE_VIEW","sessionId":"s1"}]}`},
		{name: "invalid date range", path: "/internal/analytics/summary", body: `{"from":"2026-02-01T00:00:00Z","to":"2026-01-01T00:00:00Z","bucket":"day"}`},
		{name: "invalid bucket", path: "/internal/analytics/summary", body: `{"from":"2026-01-01T00:00:00Z","to":"2026-01-02T00:00:00Z","bucket":"month"}`},
		{name: "unknown summary field", path: "/internal/analytics/summary", body: `{"from":"2026-01-01T00:00:00Z","to":"2026-01-02T00:00:00Z","bucket":"day","userId":"x"}`},
		{name: "unknown rollup field", path: "/internal/jobs/analytics-rollup", body: `{"rawWindowDays": 10}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer test-secret")
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusBadRequest, recorder.Body.String())
			}
		})
	}
}

func TestDataIntegrityScanRequiresAuthorization(t *testing.T) {
	cases := []struct {
		name   string
		header string
	}{
		{name: "missing"},
		{name: "wrong token", header: "Bearer wrong"},
		{name: "wrong scheme", header: "Basic test-secret"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			req := httptest.NewRequest(http.MethodPost, "/internal/integrity/scan", strings.NewReader(`{}`))
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

func TestDataIntegrityScanRejectsInvalidBodyBeforeDatabaseAccess(t *testing.T) {
	for _, body := range []string{"", `null`, `[]`, `{"unexpected":true}`, `{} {}`} {
		req := httptest.NewRequest(http.MethodPost, "/internal/integrity/scan", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer test-secret")
		recorder := httptest.NewRecorder()
		testHandler().ServeHTTP(recorder, req)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("body %q: status = %d, want %d; response=%s", body, recorder.Code, http.StatusBadRequest, recorder.Body.String())
		}
	}
}

func TestDataIntegrityScanHandlesMissingDatabaseWithoutPanic(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/internal/integrity/scan", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer test-secret")
	recorder := httptest.NewRecorder()
	testHandler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status = %d, want %d; response=%s", recorder.Code, http.StatusServiceUnavailable, recorder.Body.String())
	}
	if strings.Contains(strings.ToLower(recorder.Body.String()), "database is required") {
		t.Fatal("internal error details must not be returned to the caller")
	}
}

func TestMediaCleanupEndpointsRequireBearerAuthorization(t *testing.T) {
	cases := []struct {
		method string
		path   string
		body   string
	}{
		{method: http.MethodPost, path: "/internal/jobs/cleanup-media-assets", body: `{}`},
		{method: http.MethodGet, path: "/internal/media/cleanup/status"},
	}
	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusUnauthorized {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusUnauthorized)
			}
		})
	}
}

func TestMediaCleanupEndpointsHandleMissingDatabaseWithoutPanic(t *testing.T) {
	cases := []struct {
		method string
		path   string
		body   string
	}{
		{method: http.MethodPost, path: "/internal/jobs/cleanup-media-assets", body: `{}`},
		{method: http.MethodGet, path: "/internal/media/cleanup/status"},
	}
	for _, tc := range cases {
		t.Run(tc.path, func(t *testing.T) {
			req := httptest.NewRequest(tc.method, tc.path, strings.NewReader(tc.body))
			req.Header.Set("Authorization", "Bearer test-secret")
			recorder := httptest.NewRecorder()
			testHandler().ServeHTTP(recorder, req)
			if recorder.Code != http.StatusServiceUnavailable {
				t.Fatalf("status = %d, want %d; body=%s", recorder.Code, http.StatusServiceUnavailable, recorder.Body.String())
			}
		})
	}
}

func TestFraudMonitorEndpointRequiresAuthorization(t *testing.T) {
	for _, header := range []string{"", "Bearer wrong", "Basic test-secret"} {
		req := httptest.NewRequest(http.MethodPost, "/internal/fraud/monitor/scan", strings.NewReader(`{}`))
		if header != "" {
			req.Header.Set("Authorization", header)
		}
		recorder := httptest.NewRecorder()
		testHandler().ServeHTTP(recorder, req)
		if recorder.Code != http.StatusUnauthorized {
			t.Fatalf("header %q: status=%d, want %d", header, recorder.Code, http.StatusUnauthorized)
		}
	}
}

func TestFraudMonitorEndpointRejectsInvalidBodiesBeforeDatabaseAccess(t *testing.T) {
	for _, body := range []string{"", `null`, `[]`, `{"unexpected":true}`, `{} {}`} {
		req := httptest.NewRequest(http.MethodPost, "/internal/fraud/monitor/scan", strings.NewReader(body))
		req.Header.Set("Authorization", "Bearer test-secret")
		recorder := httptest.NewRecorder()
		testHandler().ServeHTTP(recorder, req)
		if recorder.Code != http.StatusBadRequest {
			t.Fatalf("body %q: status=%d, want %d; response=%s", body, recorder.Code, http.StatusBadRequest, recorder.Body.String())
		}
	}
}

func TestFraudMonitorEndpointHandlesMissingDatabaseWithoutPanic(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/internal/fraud/monitor/scan", strings.NewReader(`{}`))
	req.Header.Set("Authorization", "Bearer test-secret")
	recorder := httptest.NewRecorder()
	testHandler().ServeHTTP(recorder, req)
	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status=%d, want %d; response=%s", recorder.Code, http.StatusServiceUnavailable, recorder.Body.String())
	}
	if strings.Contains(strings.ToLower(recorder.Body.String()), "database is required") {
		t.Fatalf("internal error details must not be exposed: %s", recorder.Body.String())
	}
}
