package fraudmonitor

import (
	"context"
	"database/sql"
	"strings"
	"testing"
)

func TestDefinitionsAreUniqueBoundedReadOnlyChecks(t *testing.T) {
	definitions := Definitions()
	if len(definitions) != 4 {
		t.Fatalf("got %d checks, want 4", len(definitions))
	}
	seen := make(map[string]bool, len(definitions))
	for _, definition := range definitions {
		if definition.Code == "" || definition.Title == "" || definition.Description == "" || definition.EntityType == "" {
			t.Fatalf("check metadata is incomplete: %+v", definition)
		}
		if seen[definition.Code] {
			t.Fatalf("duplicate check code %q", definition.Code)
		}
		seen[definition.Code] = true
		if definition.Severity != "critical" && definition.Severity != "warning" && definition.Severity != "info" {
			t.Fatalf("check %s has invalid severity %q", definition.Code, definition.Severity)
		}
		query := strings.ToLower(strings.TrimSpace(definition.Query))
		if !strings.HasPrefix(query, "select ") && !strings.HasPrefix(query, "with ") {
			t.Fatalf("check %s is not a read-only SELECT/CTE query", definition.Code)
		}
		for _, forbidden := range []string{"insert ", "update ", "delete ", "truncate ", "alter ", "drop ", "create ", "grant ", "revoke ", " for update"} {
			if strings.Contains(query, forbidden) {
				t.Fatalf("check %s contains forbidden SQL fragment %q", definition.Code, forbidden)
			}
		}
		if !strings.Contains(query, `"id"`) {
			t.Fatalf("check %s must expose an id for each sample", definition.Code)
		}
	}
}

func TestExpectedAbuseChecksAreRegistered(t *testing.T) {
	want := []string{
		"REPORTER_BURST",
		"REPORT_TARGET_BURST",
		"NEW_ACCOUNT_REPORT_BURST",
		"REPEATED_UNREVIEWED_FRAUD_SIGNALS",
	}
	got := make(map[string]bool)
	for _, definition := range Definitions() {
		got[definition.Code] = true
	}
	for _, code := range want {
		if !got[code] {
			t.Errorf("missing fraud monitor check %s", code)
		}
	}
}

func TestScanRejectsMissingDatabase(t *testing.T) {
	if _, err := Scan(context.Background(), nil); err == nil {
		t.Fatal("expected missing database error")
	}
}

func TestScanRequiresContext(t *testing.T) {
	if _, err := Scan(nil, &sql.DB{}); err == nil || !strings.Contains(err.Error(), "context is required") {
		t.Fatalf("expected context validation error, got %v", err)
	}
}

func TestSampleLimitIsBounded(t *testing.T) {
	if SampleLimit != 10 {
		t.Fatalf("SampleLimit = %d, want 10", SampleLimit)
	}
}

func TestReportTargetBurstUsesSlidingTwoHourWindows(t *testing.T) {
	var target CheckDefinition
	for _, definition := range Definitions() {
		if definition.Code == "REPORT_TARGET_BURST" {
			target = definition
			break
		}
	}
	if target.Code == "" {
		t.Fatal("REPORT_TARGET_BURST definition is missing")
	}
	for _, fragment := range []string{
		"candidate_windows",
		"window_report.\"createdAt\" <= anchor.\"createdAt\" + INTERVAL '2 hours'",
		"ROW_NUMBER() OVER",
		"PARTITION BY \"targetType\", \"targetId\"",
		"WHERE \"windowRank\" = 1",
	} {
		if !strings.Contains(target.Query, fragment) {
			t.Errorf("REPORT_TARGET_BURST query does not include %q", fragment)
		}
	}
}
