package loadtracker

import (
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestMiddlewarePublishesInternalConcurrencyAndReleasesCounter(t *testing.T) {
	tracker := New()
	handler := tracker.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		if got := tracker.Active(); got != 1 {
			t.Fatalf("active inside handler = %d, want 1", got)
		}
		w.WriteHeader(http.StatusNoContent)
	}))
	request := httptest.NewRequest(http.MethodPost, "/internal/jobs/run", nil)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusNoContent {
		t.Fatalf("status = %d, want %d", response.Code, http.StatusNoContent)
	}
	if got := response.Header().Get(HeaderName); got != "1" {
		t.Fatalf("load header = %q, want 1", got)
	}
	if got := tracker.Active(); got != 0 {
		t.Fatalf("active after handler = %d, want 0", got)
	}
}

func TestMiddlewareDoesNotExposeLoadHeaderOnPublicHealthRoute(t *testing.T) {
	tracker := New()
	handler := tracker.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) { w.WriteHeader(http.StatusOK) }))
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/healthz", nil))
	if got := response.Header().Get(HeaderName); got != "" {
		t.Fatalf("public load header = %q, want empty", got)
	}
}

func TestBeginTracksBackgroundWorkAndReleaseIsIdempotent(t *testing.T) {
	tracker := New()
	release := tracker.Begin()
	if got := tracker.Active(); got != 1 {
		t.Fatalf("active while background work runs = %d, want 1", got)
	}
	release()
	release()
	if got := tracker.Active(); got != 0 {
		t.Fatalf("active after release = %d, want 0", got)
	}
}

func TestMiddlewareCombinesHttpAndBackgroundWork(t *testing.T) {
	tracker := New()
	releaseJob := tracker.Begin()
	defer releaseJob()
	response := httptest.NewRecorder()
	tracker.Middleware(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusNoContent)
	})).ServeHTTP(response, httptest.NewRequest(http.MethodGet, "/internal/analytics", nil))
	if got := response.Header().Get(HeaderName); got != "2" {
		t.Fatalf("load header = %q, want 2 (one job plus this HTTP request)", got)
	}
}
