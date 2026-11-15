package main

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestDecodeStrictJSON(t *testing.T) {
	type payload struct {
		Name string `json:"name"`
	}
	cases := []struct {
		name string
		body string
		ok   bool
	}{
		{name: "valid", body: `{"name":"a"}`, ok: true},
		{name: "unknown field", body: `{"name":"a","extra":1}`},
		{name: "trailing value", body: `{"name":"a"} {"name":"b"}`},
		{name: "empty body", body: ``},
		{name: "oversized", body: `{"name":"` + strings.Repeat("x", 64) + `"}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			var got payload
			ok := decodeStrictJSON(recorder, req, 32, &got, "bad payload")
			if ok != tc.ok {
				t.Fatalf("decodeStrictJSON = %v, want %v", ok, tc.ok)
			}
			if !tc.ok && recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
			}
			if tc.ok && got.Name != "a" {
				t.Fatalf("decoded name = %q, want a", got.Name)
			}
		})
	}
}

func TestDecodeRetentionDays(t *testing.T) {
	cases := []struct {
		name string
		body string
		want int
		ok   bool
	}{
		{name: "default when omitted", body: `{}`, want: 30, ok: true},
		{name: "explicit value", body: `{"retentionDays":7}`, want: 7, ok: true},
		{name: "upper bound", body: `{"retentionDays":365}`, want: 365, ok: true},
		{name: "zero", body: `{"retentionDays":0}`},
		{name: "above max", body: `{"retentionDays":366}`},
		{name: "wrong type", body: `{"retentionDays":"7"}`},
		{name: "unknown field", body: `{"days":7}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			recorder := httptest.NewRecorder()
			req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(tc.body))
			got, ok := decodeRetentionDays(recorder, req, 30, 365)
			if ok != tc.ok {
				t.Fatalf("ok = %v, want %v (body=%s)", ok, tc.ok, recorder.Body.String())
			}
			if tc.ok && got != tc.want {
				t.Fatalf("days = %d, want %d", got, tc.want)
			}
			if !tc.ok && recorder.Code != http.StatusBadRequest {
				t.Fatalf("status = %d, want %d", recorder.Code, http.StatusBadRequest)
			}
		})
	}
}

func TestAuthorizedRequiresBearerScheme(t *testing.T) {
	cases := []struct {
		header string
		want   bool
	}{
		{header: "Bearer secret", want: true},
		{header: "Bearer wrong"},
		{header: "Basic secret"},
		{header: "Bearer "},
		{header: ""},
	}
	for _, tc := range cases {
		req := httptest.NewRequest(http.MethodGet, "/", nil)
		if tc.header != "" {
			req.Header.Set("Authorization", tc.header)
		}
		if got := authorized(req, "secret"); got != tc.want {
			t.Fatalf("authorized(%q) = %v, want %v", tc.header, got, tc.want)
		}
	}
}

func TestRoutesRegistersEveryDocumentedEndpoint(t *testing.T) {
	s := &server{token: "secret"}
	mux := s.routes()
	for _, endpoint := range []struct{ method, path string }{
		{http.MethodGet, "/healthz"},
		{http.MethodGet, "/internal/diagnostics"},
		{http.MethodPost, "/internal/jobs/analytics-retention"},
		{http.MethodPost, "/internal/exports/sales.csv"},
		{http.MethodPost, "/internal/scheduler/run-due"},
		{http.MethodPost, "/internal/push/fcm/send"},
	} {
		req := httptest.NewRequest(endpoint.method, endpoint.path, nil)
		if _, pattern := mux.Handler(req); pattern == "" {
			t.Fatalf("no route registered for %s %s", endpoint.method, endpoint.path)
		}
	}
}
