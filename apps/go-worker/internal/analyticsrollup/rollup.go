// Package analyticsrollup maintains rebuildable UTC daily aggregates for
// product-analytics events. analytics_events remains the source of truth.
package analyticsrollup

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const (
	AdvisoryLockID           int64 = 731904302
	DefaultRawWindowDays           = 90
	DefaultBackfillDays            = 14
	DefaultRefreshRecentDays       = 3
	DefaultRetentionDays           = 400
	MaxRawWindowDays               = 3650
	MaxBackfillDays                = 90
	MaxRefreshRecentDays           = 14
	MaxRetentionDays               = 3650
)

type Config struct {
	RawWindowDays     int
	BackfillDays      int
	RefreshRecentDays int
	RetentionDays     int
}

type Result struct {
	WindowStart   string   `json:"windowStart"`
	WindowEnd     string   `json:"windowEnd"`
	PlannedDays   int      `json:"plannedDays"`
	RebuiltDays   int      `json:"rebuiltDays"`
	SkippedDays   int      `json:"skippedDays"`
	SourceEvents  int64    `json:"sourceEvents"`
	RollupRows    int64    `json:"rollupRows"`
	PrunedDays    int64    `json:"prunedDays"`
	PrunedRows    int64    `json:"prunedRows"`
	ProcessedDays []string `json:"processedDays"`
}

func DefaultConfig() Config {
	return Config{
		RawWindowDays: DefaultRawWindowDays, BackfillDays: DefaultBackfillDays,
		RefreshRecentDays: DefaultRefreshRecentDays, RetentionDays: DefaultRetentionDays,
	}
}

func (c Config) Validate() error {
	if c.RawWindowDays < 1 || c.RawWindowDays > MaxRawWindowDays {
		return fmt.Errorf("rawWindowDays must be between 1 and %d", MaxRawWindowDays)
	}
	if c.BackfillDays < 1 || c.BackfillDays > MaxBackfillDays {
		return fmt.Errorf("backfillDays must be between 1 and %d", MaxBackfillDays)
	}
	if c.RefreshRecentDays < 0 || c.RefreshRecentDays > MaxRefreshRecentDays {
		return fmt.Errorf("refreshRecentDays must be between 0 and %d", MaxRefreshRecentDays)
	}
	if c.RetentionDays < 365 || c.RetentionDays > MaxRetentionDays {
		return fmt.Errorf("retentionDays must be between 365 and %d", MaxRetentionDays)
	}
	if c.RetentionDays < c.RawWindowDays {
		return errors.New("rollup retention must be at least as long as the raw analytics retention window")
	}
	return nil
}

// FullDayRange returns the UTC [start,end) interval of complete calendar days
// wholly contained in [from,to). Partial edge days must be read from raw events.
func FullDayRange(from, to time.Time) (time.Time, time.Time) {
	from = from.UTC()
	to = to.UTC()
	start := midnightUTC(from)
	if !from.Equal(start) {
		start = start.AddDate(0, 0, 1)
	}
	end := midnightUTC(to)
	if end.Before(start) {
		end = start
	}
	return start, end
}

// PlanDays returns oldest missing dates up to BackfillDays, then refreshes the
// most recent completed dates to absorb routine delayed writes. Today is never
// rolled up because it is still receiving events.
func PlanDays(now time.Time, completed map[string]struct{}, config Config) ([]time.Time, time.Time, time.Time, error) {
	if err := config.Validate(); err != nil {
		return nil, time.Time{}, time.Time{}, err
	}
	today := midnightUTC(now)
	windowStart := today.AddDate(0, 0, -config.RawWindowDays)
	windowEnd := today
	planned := make([]time.Time, 0, config.BackfillDays+config.RefreshRecentDays)
	seen := make(map[string]struct{}, cap(planned))
	add := func(day time.Time) {
		key := day.Format("2006-01-02")
		if _, exists := seen[key]; exists {
			return
		}
		seen[key] = struct{}{}
		planned = append(planned, day)
	}

	missing := 0
	for day := windowStart; day.Before(windowEnd) && missing < config.BackfillDays; day = day.AddDate(0, 0, 1) {
		if _, exists := completed[day.Format("2006-01-02")]; !exists {
			add(day)
			missing++
		}
	}
	for offset := config.RefreshRecentDays; offset >= 1; offset-- {
		day := today.AddDate(0, 0, -offset)
		if !day.Before(windowStart) {
			add(day)
		}
	}
	return planned, windowStart, windowEnd, nil
}

// Run rebuilds a bounded set of daily aggregates. Each day is one short
// transaction with a transaction-scoped advisory lock, so retries are safe
// and competing Go/Express runners cannot rebuild the same day concurrently.
func Run(ctx context.Context, db *sql.DB, now time.Time, config Config) (Result, error) {
	if db == nil {
		return Result{}, errors.New("analytics rollup database is required")
	}
	if err := config.Validate(); err != nil {
		return Result{}, err
	}

	windowStart := midnightUTC(now).AddDate(0, 0, -config.RawWindowDays)
	windowEnd := midnightUTC(now)
	queryCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	rows, err := db.QueryContext(queryCtx, `
		SELECT to_char("bucketDate", 'YYYY-MM-DD')
		FROM "analytics_rollup_days"
		WHERE "bucketDate" >= $1::date AND "bucketDate" < $2::date
	`, windowStart.Format("2006-01-02"), windowEnd.Format("2006-01-02"))
	cancel()
	if err != nil {
		return Result{}, fmt.Errorf("read analytics rollup coverage: %w", err)
	}
	completed := make(map[string]struct{}, config.RawWindowDays)
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			_ = rows.Close()
			return Result{}, fmt.Errorf("scan analytics rollup coverage: %w", err)
		}
		completed[key] = struct{}{}
	}
	rowsErr := rows.Err()
	closeErr := rows.Close()
	if rowsErr != nil {
		return Result{}, fmt.Errorf("iterate analytics rollup coverage: %w", rowsErr)
	}
	if closeErr != nil {
		return Result{}, fmt.Errorf("close analytics rollup coverage: %w", closeErr)
	}

	planned, start, end, err := PlanDays(now, completed, config)
	if err != nil {
		return Result{}, err
	}
	result := Result{
		WindowStart: start.Format("2006-01-02"), WindowEnd: end.Format("2006-01-02"),
		PlannedDays: len(planned), ProcessedDays: make([]string, 0, len(planned)),
	}
	for _, day := range planned {
		if err := ctx.Err(); err != nil {
			return result, err
		}
		rebuilt, sourceEvents, rollupRows, err := rebuildDay(ctx, db, day)
		if err != nil {
			return result, fmt.Errorf("rebuild analytics rollup for %s: %w", day.Format("2006-01-02"), err)
		}
		result.ProcessedDays = append(result.ProcessedDays, day.Format("2006-01-02"))
		if !rebuilt {
			result.SkippedDays++
			continue
		}
		result.RebuiltDays++
		result.SourceEvents += sourceEvents
		result.RollupRows += rollupRows
	}

	pruneBefore := midnightUTC(now).AddDate(0, 0, -config.RetentionDays)
	pruneCtx, pruneCancel := context.WithTimeout(ctx, 10*time.Second)
	defer pruneCancel()
	var prunedDays, prunedRows int64
	err = db.QueryRowContext(pruneCtx, `
		WITH deleted_rollups AS (
			DELETE FROM "analytics_event_daily_rollups" WHERE "bucketDate" < $1::date RETURNING 1
		), deleted_days AS (
			DELETE FROM "analytics_rollup_days" WHERE "bucketDate" < $1::date RETURNING 1
		)
		SELECT (SELECT COUNT(*) FROM deleted_days), (SELECT COUNT(*) FROM deleted_rollups)
	`, pruneBefore.Format("2006-01-02")).Scan(&prunedDays, &prunedRows)
	if err != nil {
		return result, fmt.Errorf("prune old analytics rollups: %w", err)
	}
	result.PrunedDays = prunedDays
	result.PrunedRows = prunedRows
	return result, nil
}

func rebuildDay(ctx context.Context, db *sql.DB, day time.Time) (bool, int64, int64, error) {
	day = midnightUTC(day)
	dayKey := day.Format("2006-01-02")
	txCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	tx, err := db.BeginTx(txCtx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return false, 0, 0, fmt.Errorf("begin day transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var locked bool
	if err := tx.QueryRowContext(txCtx, `SELECT pg_try_advisory_xact_lock($1::bigint)`, AdvisoryLockID).Scan(&locked); err != nil {
		return false, 0, 0, fmt.Errorf("acquire day lock: %w", err)
	}
	if !locked {
		return false, 0, 0, nil
	}
	if _, err := tx.ExecContext(txCtx, `DELETE FROM "analytics_event_daily_rollups" WHERE "bucketDate" = $1::date`, dayKey); err != nil {
		return false, 0, 0, fmt.Errorf("clear previous day rollup: %w", err)
	}

	rows, err := tx.QueryContext(txCtx, `
		INSERT INTO "analytics_event_daily_rollups"
			("bucketDate", "event", "categoryId", "eventCount", "updatedAt")
		SELECT $1::date,
		       "event",
		       CASE WHEN "event" = 'CATEGORY_BROWSE'
		            THEN COALESCE("metadata"->>'categoryId', '')
		            ELSE '' END,
		       COUNT(*)::bigint,
		       NOW()
		FROM "analytics_events"
		WHERE "createdAt" >= $1::date AND "createdAt" < ($1::date + INTERVAL '1 day')
		GROUP BY "event",
		         CASE WHEN "event" = 'CATEGORY_BROWSE'
		              THEN COALESCE("metadata"->>'categoryId', '')
		              ELSE '' END
		RETURNING "eventCount"
	`, dayKey)
	if err != nil {
		return false, 0, 0, fmt.Errorf("insert daily aggregation: %w", err)
	}
	var sourceEvents, rollupRows int64
	for rows.Next() {
		var count int64
		if err := rows.Scan(&count); err != nil {
			_ = rows.Close()
			return false, 0, 0, fmt.Errorf("scan daily aggregation: %w", err)
		}
		sourceEvents += count
		rollupRows++
	}
	rowsErr := rows.Err()
	closeErr := rows.Close()
	if rowsErr != nil {
		return false, 0, 0, fmt.Errorf("iterate daily aggregation: %w", rowsErr)
	}
	if closeErr != nil {
		return false, 0, 0, fmt.Errorf("close daily aggregation: %w", closeErr)
	}

	if _, err := tx.ExecContext(txCtx, `
		INSERT INTO "analytics_rollup_days" ("bucketDate", "sourceEventCount", "rollupRowCount", "computedAt")
		VALUES ($1::date, $2, $3, NOW())
		ON CONFLICT ("bucketDate") DO UPDATE
		SET "sourceEventCount" = EXCLUDED."sourceEventCount",
		    "rollupRowCount" = EXCLUDED."rollupRowCount",
		    "computedAt" = NOW()
	`, dayKey, sourceEvents, rollupRows); err != nil {
		return false, 0, 0, fmt.Errorf("mark rollup day completed: %w", err)
	}
	if err := tx.Commit(); err != nil {
		return false, 0, 0, fmt.Errorf("commit daily aggregation: %w", err)
	}
	return true, sourceEvents, rollupRows, nil
}

func midnightUTC(value time.Time) time.Time {
	value = value.UTC()
	return time.Date(value.Year(), value.Month(), value.Day(), 0, 0, 0, 0, time.UTC)
}
