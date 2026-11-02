package analyticsrollup

import (
	"testing"
	"time"
)

func TestFullDayRangeUsesOnlyCompleteUTCDateBuckets(t *testing.T) {
	cases := []struct {
		name      string
		from      time.Time
		to        time.Time
		wantStart string
		wantEnd   string
	}{
		{
			name:      "whole days",
			from:      time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC),
			to:        time.Date(2026, 11, 4, 0, 0, 0, 0, time.UTC),
			wantStart: "2026-11-01", wantEnd: "2026-11-04",
		},
		{
			name:      "partial boundary days",
			from:      time.Date(2026, 11, 1, 12, 30, 0, 0, time.FixedZone("UTC+2", 2*60*60)),
			to:        time.Date(2026, 11, 4, 18, 0, 0, 0, time.UTC),
			wantStart: "2026-11-02", wantEnd: "2026-11-04",
		},
		{
			name:      "same day partial range has no rollup days",
			from:      time.Date(2026, 11, 1, 8, 0, 0, 0, time.UTC),
			to:        time.Date(2026, 11, 1, 20, 0, 0, 0, time.UTC),
			wantStart: "2026-11-02", wantEnd: "2026-11-02",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			start, end := FullDayRange(tc.from, tc.to)
			if got := start.Format("2006-01-02"); got != tc.wantStart {
				t.Fatalf("full range start = %s, want %s", got, tc.wantStart)
			}
			if got := end.Format("2006-01-02"); got != tc.wantEnd {
				t.Fatalf("full range end = %s, want %s", got, tc.wantEnd)
			}
			if end.Before(start) {
				t.Fatalf("full range is reversed: %s < %s", end, start)
			}
		})
	}
}

func TestPlanDaysBackfillsOldestMissingAndRefreshesRecent(t *testing.T) {
	config := Config{RawWindowDays: 10, BackfillDays: 2, RefreshRecentDays: 2, RetentionDays: 400}
	now := time.Date(2026, 11, 2, 1, 15, 0, 0, time.UTC)
	completed := map[string]struct{}{
		"2026-10-23": {},
		"2026-10-24": {},
		"2026-10-25": {},
		"2026-11-01": {},
	}
	planned, start, end, err := PlanDays(now, completed, config)
	if err != nil {
		t.Fatal(err)
	}
	if start.Format("2006-01-02") != "2026-10-23" || end.Format("2006-01-02") != "2026-11-02" {
		t.Fatalf("unexpected planning window: [%s,%s)", start, end)
	}
	got := make([]string, 0, len(planned))
	seen := make(map[string]struct{})
	for _, day := range planned {
		key := day.Format("2006-01-02")
		if _, duplicate := seen[key]; duplicate {
			t.Fatalf("duplicate planned date %s", key)
		}
		seen[key] = struct{}{}
		got = append(got, key)
	}
	want := []string{"2026-10-26", "2026-10-27", "2026-10-31", "2026-11-01"}
	if len(got) != len(want) {
		t.Fatalf("planned dates = %v, want %v", got, want)
	}
	for i := range want {
		if got[i] != want[i] {
			t.Fatalf("planned dates = %v, want %v", got, want)
		}
	}
}

func TestPlanDaysDoesNotScheduleCurrentUTCDate(t *testing.T) {
	config := Config{RawWindowDays: 3, BackfillDays: 3, RefreshRecentDays: 3, RetentionDays: 400}
	now := time.Date(2026, 11, 2, 23, 30, 0, 0, time.FixedZone("Gaza", 2*60*60))
	planned, _, _, err := PlanDays(now, map[string]struct{}{}, config)
	if err != nil {
		t.Fatal(err)
	}
	for _, day := range planned {
		if !day.Before(midnightUTC(now)) {
			t.Fatalf("current UTC day was scheduled: %s", day)
		}
	}
}

func TestConfigRejectsUnsafeLimits(t *testing.T) {
	base := Config{RawWindowDays: 90, BackfillDays: 14, RefreshRecentDays: 3, RetentionDays: 400}
	cases := []struct {
		name   string
		mutate func(*Config)
	}{
		{name: "raw window zero", mutate: func(c *Config) { c.RawWindowDays = 0 }},
		{name: "backfill too high", mutate: func(c *Config) { c.BackfillDays = MaxBackfillDays + 1 }},
		{name: "refresh too high", mutate: func(c *Config) { c.RefreshRecentDays = MaxRefreshRecentDays + 1 }},
		{name: "rollup retention shorter than raw retention", mutate: func(c *Config) { c.RetentionDays = 90 }},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			config := base
			tc.mutate(&config)
			if err := config.Validate(); err == nil {
				t.Fatal("expected invalid configuration")
			}
		})
	}
}
