// Package scheduler owns the business-date rules for the durable MarketPlat
// scheduled-job ledger. Job execution remains delegated to the API's compiled
// job adapters so their post-commit cache/SSE/edge effects are preserved.
package scheduler

import "time"

const TimeZone = "Asia/Gaza"

type Definition struct {
	Name     string
	Hour     int
	Minute   int
	Weekdays []time.Weekday
}

type DueJob struct {
	Definition   Definition
	ScheduledFor string
}

// Definitions mirrors the legacy API scheduler's ordered job list. Hour and
// Minute are retained as operational metadata: the daily GitHub invocation is
// the trigger, while scheduledDate applies the existing one-day catch-up rule.
func Definitions() []Definition {
	return []Definition{
		{Name: "report:expire-ads", Hour: -1, Minute: 0},
		{Name: "report:notification-digest", Hour: 7, Minute: 0},
		{Name: "report:seller-response-metrics", Hour: 3, Minute: 0},
		{Name: "report:cleanup-tokens", Hour: 3, Minute: 15},
		{Name: "report:cleanup-failed-tasks", Hour: 3, Minute: 30},
		{Name: "report:cleanup-notifications", Hour: 3, Minute: 30, Weekdays: []time.Weekday{time.Sunday}},
		{Name: "report:cleanup-stories", Hour: 3, Minute: 40},
		{Name: "report:cleanup-media-assets", Hour: 3, Minute: 50},
		{Name: "report:analytics-rollup", Hour: 3, Minute: 42},
		{Name: "report:inventory-monitor", Hour: 7, Minute: 15},
		{Name: "report:fraud-monitor", Hour: 7, Minute: 45},
		{Name: "report:expire-service-requests", Hour: 3, Minute: 45},
		{Name: "report:cleanup-analytics", Hour: 3, Minute: 45},
		{Name: "report:demote-stale-boosts", Hour: 4, Minute: 0, Weekdays: []time.Weekday{time.Sunday}},
		{Name: "report:weekly-ad-views", Hour: 8, Minute: 0, Weekdays: []time.Weekday{time.Monday}},
		{Name: "report:weekly-store-views", Hour: 8, Minute: 15, Weekdays: []time.Weekday{time.Monday}},
		{Name: "report:weekly-service-views", Hour: 8, Minute: 30, Weekdays: []time.Weekday{time.Monday}},
		{Name: "report:expire-open-requests", Hour: -2, Minute: 20},
	}
}

// ScheduledDate returns today's business date for daily jobs, today's date
// for weekday jobs on their configured day, or yesterday's date for the
// existing one-day catch-up window. It returns false outside that window.
func ScheduledDate(job Definition, now time.Time, location *time.Location) (string, bool) {
	if location == nil {
		location = time.UTC
	}
	localNow := now.In(location)
	if len(job.Weekdays) == 0 {
		return localNow.Format("2006-01-02"), true
	}
	if containsWeekday(job.Weekdays, localNow.Weekday()) {
		return localNow.Format("2006-01-02"), true
	}
	yesterday := localNow.AddDate(0, 0, -1)
	if containsWeekday(job.Weekdays, yesterday.Weekday()) {
		return yesterday.Format("2006-01-02"), true
	}
	return "", false
}

func DueJobs(now time.Time, location *time.Location) []DueJob {
	definitions := Definitions()
	due := make([]DueJob, 0, len(definitions))
	for _, definition := range definitions {
		if scheduledFor, ok := ScheduledDate(definition, now, location); ok {
			due = append(due, DueJob{Definition: definition, ScheduledFor: scheduledFor})
		}
	}
	return due
}

func containsWeekday(weekdays []time.Weekday, target time.Weekday) bool {
	for _, weekday := range weekdays {
		if weekday == target {
			return true
		}
	}
	return false
}
