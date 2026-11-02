package analyticsretention

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const DefaultBatchSize = 5000

// Result describes a completed retention pass. It deliberately reports counts,
// not row IDs or analytics payloads, to keep operational responses small.
type Result struct {
	Cutoff       time.Time `json:"cutoff"`
	Deleted      int64     `json:"deleted"`
	Batches      int       `json:"batches"`
	RetentionDay int       `json:"retentionDays"`
}

// queryer is implemented by both *sql.DB and *sql.Conn. The server passes the
// same pinned connection that owns the advisory lock, avoiding pool starvation
// when DB_MAX_OPEN_CONNS=1 and ensuring the lock and job share one session.
type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// Run deletes old analytics events in bounded batches. Within the active
// rollup window, an event date must have a completed daily rollup first. Dates
// older than that window are already outside the raw-retention contract and
// can be deleted directly. This protects the bounded initial backfill: a
// missed or failed rollup delays deletion instead of losing the only copy.
func Run(ctx context.Context, db queryer, retentionDays, batchSize int, now time.Time) (Result, error) {
	if retentionDays < 1 || retentionDays > 3650 {
		return Result{}, fmt.Errorf("retentionDays must be between 1 and 3650")
	}
	if batchSize < 1 || batchSize > 50000 {
		return Result{}, fmt.Errorf("batchSize must be between 1 and 50000")
	}
	now = now.UTC()
	cutoff := now.Add(-time.Duration(retentionDays) * 24 * time.Hour)
	rollupWindowStart := time.Date(now.Year(), now.Month(), now.Day(), 0, 0, 0, 0, time.UTC).AddDate(0, 0, -retentionDays)
	result := Result{Cutoff: cutoff, RetentionDay: retentionDays}

	for {
		rows, err := db.QueryContext(ctx, `
			WITH doomed AS (
				SELECT e.id
				FROM "analytics_events" e
				WHERE e."createdAt" < $1
				  AND (
					e."createdAt" < $3::date
					OR EXISTS (
						SELECT 1
						FROM "analytics_rollup_days" d
						WHERE d."bucketDate" = e."createdAt"::date
					)
				  )
				ORDER BY e."createdAt" ASC
				LIMIT $2
			)
			DELETE FROM "analytics_events" e
			USING doomed
			WHERE e.id = doomed.id
			RETURNING e.id
		`, cutoff, batchSize, rollupWindowStart.Format("2006-01-02"))
		if err != nil {
			return result, fmt.Errorf("delete analytics retention batch: %w", err)
		}

		var batchDeleted int64
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				_ = rows.Close()
				return result, fmt.Errorf("read deleted analytics id: %w", err)
			}
			batchDeleted++
		}
		rowsErr := rows.Err()
		closeErr := rows.Close()
		if rowsErr != nil {
			return result, fmt.Errorf("iterate deleted analytics rows: %w", rowsErr)
		}
		if closeErr != nil {
			return result, fmt.Errorf("close analytics retention rows: %w", closeErr)
		}

		result.Deleted += batchDeleted
		if batchDeleted == 0 {
			break
		}
		result.Batches++
		if batchDeleted < int64(batchSize) {
			break
		}
	}
	return result, nil
}
