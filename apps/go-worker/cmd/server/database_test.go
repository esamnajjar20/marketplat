package main

import (
	"net/url"
	"testing"
)

func TestNormalizeDatabaseURLAddsApplicationName(t *testing.T) {
	got, err := normalizeDatabaseURL("postgresql://user:pass@db.example:5432/marketplat?sslmode=require")
	if err != nil {
		t.Fatalf("normalizeDatabaseURL returned error: %v", err)
	}
	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatalf("normalized URL is invalid: %v", err)
	}
	if want := "marketplat-go-worker"; parsed.Query().Get("application_name") != want {
		t.Fatalf("application_name = %q, want %q", parsed.Query().Get("application_name"), want)
	}
	if parsed.Query().Get("sslmode") != "require" {
		t.Fatal("normalization did not preserve sslmode")
	}
}

func TestNormalizeDatabaseURLPreservesExplicitApplicationName(t *testing.T) {
	got, err := normalizeDatabaseURL("postgresql://user:pass@db.example:5432/marketplat?application_name=marketplat-go-worker-blue")
	if err != nil {
		t.Fatalf("normalizeDatabaseURL returned error: %v", err)
	}
	parsed, err := url.Parse(got)
	if err != nil {
		t.Fatalf("normalized URL is invalid: %v", err)
	}
	if want := "marketplat-go-worker-blue"; parsed.Query().Get("application_name") != want {
		t.Fatalf("application_name = %q, want %q", parsed.Query().Get("application_name"), want)
	}
}
