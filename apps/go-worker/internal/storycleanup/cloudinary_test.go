package storycleanup

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"net/http"
	"net/http/httptest"
	"net/url"
	"strings"
	"testing"
)

func TestCloudinaryDeleteSignsPublicIDAndAcceptsNotFound(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost || r.URL.Path != "/v1_1/demo-cloud/image/destroy" {
			t.Fatalf("unexpected request: %s %s", r.Method, r.URL.Path)
		}
		if err := r.ParseForm(); err != nil {
			t.Fatal(err)
		}
		publicID := r.Form.Get("public_id")
		timestamp := r.Form.Get("timestamp")
		if publicID != "classifieds/stories/abc 123" || timestamp == "" {
			t.Fatalf("unexpected form values: %#v", r.Form)
		}
		signatureInput := "public_id=" + publicID + "&timestamp=" + timestamp + "secret-value"
		digest := sha1.Sum([]byte(signatureInput))
		if got, want := r.Form.Get("signature"), hex.EncodeToString(digest[:]); got != want {
			t.Fatalf("signature mismatch: got %s want %s", got, want)
		}
		if r.Form.Get("api_key") != "api-key-value" {
			t.Fatalf("missing API key")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"result":"not found"}`))
	}))
	defer server.Close()
	client := NewClient("demo-cloud", "api-key-value", "secret-value")
	client.baseURL = server.URL + "/v1_1/"
	client.http = server.Client()
	if err := client.Delete(context.Background(), "classifieds/stories/abc 123"); err != nil {
		t.Fatalf("not-found delete should be idempotent: %v", err)
	}
}

func TestCloudinaryDeleteRejectsUnconfiguredAndUnexpectedResult(t *testing.T) {
	if err := NewClient("", "", " ").Delete(context.Background(), "id"); err == nil {
		t.Fatal("expected missing credentials error")
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { _, _ = w.Write([]byte(`{"result":"error"}`)) }))
	defer server.Close()
	client := NewClient("cloud", "key", "secret")
	client.baseURL = server.URL + "/v1_1"
	client.http = server.Client()
	if err := client.Delete(context.Background(), url.PathEscape("a/b")); err == nil {
		t.Fatal("expected unexpected result error")
	}
	if strings.TrimSpace(client.apiSecret) == "" {
		t.Fatal("test setup invalid")
	}
}
