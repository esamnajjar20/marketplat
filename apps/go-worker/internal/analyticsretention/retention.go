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

// Run deletes old analytics events in bounded batches. Each batch is its own
// statement so a large retention pass does not hold one long transaction or
// create one unbounded DELETE/WAL burst. Re-running this operation is safe.
func Run(ctx context.Context, db queryer, retentionDays, batchSize int, now time.Time) (Result, error) {
	if retentionDays < 1 || retentionDays > 3650 {
		return Result{}, fmt.Errorf("retentionDays must be between 1 and 3650")
	}
	if batchSize < 1 || batchSize > 50000 {
		return Result{}, fmt.Errorf("batchSize must be between 1 and 50000")
	}
	cutoff := now.UTC().Add(-time.Duration(retentionDays) * 24 * time.Hour)
	result := Result{Cutoff: cutoff, RetentionDay: retentionDays}

	for {
		rows, err := db.QueryContext(ctx, `
			WITH doomed AS (
				SELECT id
				FROM "analytics_events"
				WHERE "createdAt" < $1
				ORDER BY "createdAt" ASC
				LIMIT $2
			)
			DELETE FROM "analytics_events" e
			USING doomed
			WHERE e.id = doomed.id
			RETURNING e.id
		`, cutoff, batchSize)
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
