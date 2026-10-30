// Package notificationretention removes old read notifications without deleting
// notifications that still have an unfinished push dispatch (including dead letters).
package notificationretention

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const (
	DefaultRetentionDays = 90
	DefaultBatchSize     = 500
	MaxBatchSize         = 5000
	MaxRetentionDays     = 3650
)

// Result contains aggregate counts only; notification IDs and user data are
// never returned to the caller or written to logs.
type Result struct {
	Deleted       int64     `json:"deleted"`
	Batches       int       `json:"batches"`
	Cutoff        time.Time `json:"cutoff"`
	RetentionDays int       `json:"retentionDays"`
}

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// Run deletes only read notifications older than retentionDays. Rows with any
// push dispatch whose processedAt is NULL are retained. In this worker,
// dead-lettered dispatches intentionally keep processedAt NULL, so this guard
// preserves them and their delivery-target recovery data from FK cascades.
//
// Each statement is a bounded, independently committed batch. The caller must
// hold the notification-retention advisory lock on the same pinned connection.
func Run(ctx context.Context, db queryer, retentionDays, batchSize int, now time.Time) (Result, error) {
	if retentionDays < 1 || retentionDays > MaxRetentionDays {
		return Result{}, fmt.Errorf("retentionDays must be between 1 and %d", MaxRetentionDays)
	}
	if batchSize < 1 || batchSize > MaxBatchSize {
		return Result{}, fmt.Errorf("batchSize must be between 1 and %d", MaxBatchSize)
	}

	now = now.UTC()
	cutoff := now.Add(-time.Duration(retentionDays) * 24 * time.Hour)
	result := Result{Cutoff: cutoff, RetentionDays: retentionDays}

	for {
		rows, err := db.QueryContext(ctx, deleteBatchSQL, cutoff, batchSize)
		if err != nil {
			return result, fmt.Errorf("delete read notification batch: %w", err)
		}

		var batchDeleted int64
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				_ = rows.Close()
				return result, fmt.Errorf("read deleted notification id: %w", err)
			}
			batchDeleted++
		}
		rowsErr := rows.Err()
		closeErr := rows.Close()
		if rowsErr != nil {
			return result, fmt.Errorf("iterate deleted notification rows: %w", rowsErr)
		}
		if closeErr != nil {
			return result, fmt.Errorf("close notification retention rows: %w", closeErr)
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

const deleteBatchSQL = `
	WITH doomed AS (
		SELECT n."id"
		FROM "notifications" AS n
		WHERE n."readAt" IS NOT NULL
		  AND n."createdAt" < $1
		  AND NOT EXISTS (
			  SELECT 1
			  FROM "notification_push_dispatches" AS dispatch
			  WHERE dispatch."notificationId" = n."id"
			    AND dispatch."processedAt" IS NULL
		  )
		ORDER BY n."createdAt" ASC, n."id" ASC
		LIMIT $2
		FOR UPDATE OF n SKIP LOCKED
	)
	DELETE FROM "notifications" AS n
	USING doomed
	WHERE n."id" = doomed."id"
	RETURNING n."id"
`
