package scheduler

import (
	"testing"
	"time"
)

func gazaLocation(t *testing.T) *time.Location {
	t.Helper()
	location, err := time.LoadLocation(TimeZone)
	if err != nil {
		t.Fatalf("load %s: %v", TimeZone, err)
	}
	return location
}

func TestScheduledDateDailyJobUsesLocalBusinessDate(t *testing.T) {
	location := gazaLocation(t)
	// 2026-11-01 23:30 UTC is already 2026-11-02 in Asia/Gaza.
	now := time.Date(2026, time.November, 1, 23, 30, 0, 0, time.UTC)
	got, ok := ScheduledDate(Definition{Name: "daily"}, now, location)
	if !ok || got != "2026-11-02" {
		t.Fatalf("ScheduledDate() = (%q, %v), want (2026-11-02, true)", got, ok)
	}
}

func TestScheduledDateWeeklyJobRunsOnConfiguredWeekday(t *testing.T) {
	location := gazaLocation(t)
	now := time.Date(2026, time.November, 2, 4, 0, 0, 0, location) // Monday
	got, ok := ScheduledDate(Definition{Name: "weekly", Weekdays: []time.Weekday{time.Monday}}, now, location)
	if !ok || got != "2026-11-02" {
		t.Fatalf("ScheduledDate() = (%q, %v), want (2026-11-02, true)", got, ok)
	}
}

func TestScheduledDateCatchesUpOnlyOnFollowingDay(t *testing.T) {
	location := gazaLocation(t)
	job := Definition{Name: "weekly", Weekdays: []time.Weekday{time.Monday}}

	tuesday := time.Date(2026, time.November, 3, 4, 0, 0, 0, location)
	got, ok := ScheduledDate(job, tuesday, location)
	if !ok || got != "2026-11-02" {
		t.Fatalf("Tuesday catch-up = (%q, %v), want (2026-11-02, true)", got, ok)
	}

	wednesday := time.Date(2026, time.November, 4, 4, 0, 0, 0, location)
	if got, ok := ScheduledDate(job, wednesday, location); ok {
		t.Fatalf("Wednesday catch-up unexpectedly returned %q", got)
	}
}

func TestScheduledDateHandlesWeekAndMonthBoundary(t *testing.T) {
	location := gazaLocation(t)
	monday := time.Date(2026, time.November, 2, 4, 0, 0, 0, location)
	got, ok := ScheduledDate(Definition{Name: "sunday", Weekdays: []time.Weekday{time.Sunday}}, monday, location)
	if !ok || got != "2026-11-01" {
		t.Fatalf("Sunday catch-up = (%q, %v), want (2026-11-01, true)", got, ok)
	}
}

func TestDefinitionsPreserveLegacyScheduleNamesAndOrder(t *testing.T) {
	jobs := Definitions()
	want := []string{
		"report:expire-ads",
		"report:notification-digest",
		"report:seller-response-metrics",
		"report:cleanup-tokens",
		"report:cleanup-failed-tasks",
		"report:cleanup-notifications",
		"report:cleanup-stories",
		"report:cleanup-media-assets",
		"report:analytics-rollup",
		"report:inventory-monitor",
		"report:fraud-monitor",
		"report:expire-service-requests",
		"report:cleanup-analytics",
		"report:demote-stale-boosts",
		"report:weekly-ad-views",
		"report:weekly-store-views",
		"report:weekly-service-views",
		"report:expire-open-requests",
	}
	if len(jobs) != len(want) {
		t.Fatalf("Definitions() returned %d jobs, want %d", len(jobs), len(want))
	}
	for i, expected := range want {
		if jobs[i].Name != expected {
			t.Errorf("Definitions()[%d].Name = %q, want %q", i, jobs[i].Name, expected)
		}
	}
}

func TestDueJobsIncludesOnlyConfiguredWeekdayJobsAndKeepsOrder(t *testing.T) {
	location := gazaLocation(t)
	monday := time.Date(2026, time.November, 2, 4, 0, 0, 0, location)
	jobs := DueJobs(monday, location)
	if len(jobs) != 18 {
		t.Fatalf("DueJobs() returned %d jobs on Monday, want 13 daily, 3 Monday, and 2 Sunday catch-up jobs", len(jobs))
	}
	if jobs[14].Definition.Name != "report:weekly-ad-views" ||
		jobs[15].Definition.Name != "report:weekly-store-views" ||
		jobs[16].Definition.Name != "report:weekly-service-views" {
		t.Fatalf("Monday weekly jobs are out of order: %#v", jobs[14:17])
	}

	tuesday := monday.AddDate(0, 0, 1)
	jobs = DueJobs(tuesday, location)
	if len(jobs) != 16 {
		t.Fatalf("DueJobs() returned %d jobs on Tuesday, want 13 daily jobs plus 3 Monday catch-up jobs", len(jobs))
	}
}
