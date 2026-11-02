package inventorymonitor

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

func TestInventoryConfigurationIsStable(t *testing.T) {
	if LowStockThreshold != 5 {
		t.Fatalf("LowStockThreshold = %d, want 5 to match product availability and seller alerts", LowStockThreshold)
	}
	if CandidateLimit < 1 || CandidateLimit > 1000 {
		t.Fatalf("CandidateLimit = %d, expected a conservative bounded batch", CandidateLimit)
	}
	if AdvisoryLockID == 0 || AdvisoryLockID == 731904302 || AdvisoryLockID == 731904303 {
		t.Fatalf("AdvisoryLockID = %d, must be non-zero and distinct from analytics/search locks", AdvisoryLockID)
	}
}

func TestStoreSummaryRejectsInvalidInputsBeforeDatabaseAccess(t *testing.T) {
	db := &sql.DB{}
	if _, err := GetStoreSummary(context.Background(), nil, "store_1"); err == nil {
		t.Fatal("expected nil database to fail")
	}
	if _, err := GetStoreSummary(nil, db, "store_1"); err == nil {
		t.Fatal("expected nil context to fail")
	}
	for _, storeID := range []string{"", strings.Repeat("x", 129)} {
		if _, err := GetStoreSummary(context.Background(), db, storeID); err == nil {
			t.Fatalf("expected invalid store ID %q to fail", storeID)
		}
	}
}

func TestAlertQueryUsesExistingIdempotencyAndPreferenceContracts(t *testing.T) {
	query := strings.ToLower(alertQuery)
	for _, expected := range []string{
		`"sales_automation_events"`,
		`'low_stock'::"salesautomationeventtype"`,
		`"lastsentat" <= now() - interval '24 hours'`,
		`'lowstockalerts'`,
		`'sales_low_stock'::"notificationtype"`,
		`"notification_push_dispatches"`,
		`candidate."stockquantity" <= 0 then 'منتج نفد من المخزون'`,
	} {
		if !strings.Contains(query, expected) {
			t.Errorf("low-stock alert SQL does not contain %q", expected)
		}
	}
	if !strings.Contains(query, `"status" = 'active'`) || !strings.Contains(query, `"stockquantity" <= $1`) {
		t.Fatal("low-stock alert SQL must select active products from zero through the shared threshold")
	}
}

func TestStoreSummarySQLContainsReadOnlyDiagnostics(t *testing.T) {
	query := strings.ToLower(storeSummaryQuery)
	for _, expected := range []string{
		`distinct on (movement."productid")`,
		`"stock_movements"`,
		`"availabilitymismatchproducts"`,
		`"movementmismatchproducts"`,
		`is distinct from`,
		`where p."storeid" = $1 and p."status" = 'active'`,
	} {
		if !strings.Contains(query, expected) {
			t.Errorf("store summary SQL does not contain %q", expected)
		}
	}
	if strings.Contains(query, `update "products"`) || strings.Contains(query, `insert into "stock_movements"`) {
		t.Fatal("inventory summary must remain read-only")
	}
}
