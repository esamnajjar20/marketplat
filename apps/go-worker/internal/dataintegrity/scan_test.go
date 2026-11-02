package dataintegrity

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

func TestDefinitionsAreUniqueBoundedReadOnlyChecks(t *testing.T) {
	definitions := Definitions()
	if len(definitions) < 10 {
		t.Fatalf("got %d checks; expected at least 10", len(definitions))
	}
	seen := make(map[string]struct{}, len(definitions))
	for _, definition := range definitions {
		if definition.Code == "" || definition.Title == "" || definition.Description == "" {
			t.Fatalf("check has missing metadata: %+v", definition)
		}
		if _, exists := seen[definition.Code]; exists {
			t.Fatalf("duplicate check code %q", definition.Code)
		}
		seen[definition.Code] = struct{}{}
		if definition.Severity != "critical" && definition.Severity != "warning" && definition.Severity != "info" {
			t.Fatalf("check %s has unsupported severity %q", definition.Code, definition.Severity)
		}
		query := strings.ToLower(strings.TrimSpace(definition.Query))
		if !strings.HasPrefix(query, "select ") {
			t.Fatalf("check %s must be a SELECT query", definition.Code)
		}
		for _, forbidden := range []string{"insert ", "update ", "delete ", "truncate ", "alter ", "drop ", "create ", "grant ", "revoke "} {
			if strings.Contains(query, forbidden) {
				t.Fatalf("check %s contains a mutation keyword %q", definition.Code, forbidden)
			}
		}
		if !strings.Contains(query, `"id"`) {
			t.Fatalf("check %s must expose a stable entity id for bounded samples", definition.Code)
		}
	}
}

func TestExpectedIntegrityRulesAreRegistered(t *testing.T) {
	want := []string{
		"AD_ACTIVE_AFTER_EXPIRY",
		"OPEN_REQUEST_AFTER_EXPIRY",
		"PROMOTION_STATUS_DRIFT",
		"PROMOTION_STORE_PRODUCT_MISMATCH",
		"PRODUCT_NEGATIVE_STOCK",
		"PRODUCT_ZERO_STOCK_AVAILABLE",
		"STOCK_MOVEMENT_DELTA_MISMATCH",
		"ORDER_MISSING_STATUS_TIMESTAMP",
		"ORDER_STORE_SELLER_MISMATCH",
		"ORDER_ITEM_STORE_MISMATCH",
		"ACCEPTED_REQUEST_OFFER_MISMATCH",
		"PUSH_DISPATCH_USER_MISMATCH",
		"APPOINTMENT_INVALID_TIME_RANGE",
	}
	definitions := Definitions()
	if len(definitions) != len(want) {
		t.Fatalf("registered %d checks, want %d", len(definitions), len(want))
	}
	got := make(map[string]bool, len(definitions))
	for _, definition := range definitions {
		got[definition.Code] = true
	}
	for _, code := range want {
		if !got[code] {
			t.Errorf("missing integrity check %s", code)
		}
	}
}

func TestPromotionStatusDriftDetectsPrematureExpiredState(t *testing.T) {
	for _, definition := range Definitions() {
		if definition.Code == "PROMOTION_STATUS_DRIFT" {
			query := strings.ToLower(definition.Query)
			if !strings.Contains(query, `"status" = 'expired' and "endsat" > now()`) {
				t.Fatal("promotion status check must detect EXPIRED rows whose time/use conditions have not expired")
			}
			return
		}
	}
	t.Fatal("PROMOTION_STATUS_DRIFT check is not registered")
}

func TestScanRejectsMissingDatabase(t *testing.T) {
	if _, err := Scan(context.Background(), nil); err == nil {
		t.Fatal("expected missing database error")
	}
}

func TestScanRequiresContext(t *testing.T) {
	// A non-nil but unused DB proves context validation happens before any
	// connection attempt; Scan must return without touching the pool.
	db := &sql.DB{}
	if _, err := Scan(nil, db); err == nil || !strings.Contains(err.Error(), "context is required") {
		t.Fatalf("expected context validation error, got %v", err)
	}
}

func TestSampleLimitIsBounded(t *testing.T) {
	if SampleLimit != 10 {
		t.Fatalf("SampleLimit = %d, want 10", SampleLimit)
	}
}
