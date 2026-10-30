// Package failedtaskretention removes only resolved background-task records
// after the configured retention period. Unresolved records are never deleted.
package failedtaskretention

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const (
	DefaultRetentionDays = 30
	DefaultBatchSize     = 500
	MaxBatchSize         = 5000
	MaxRetentionDays     = 3650
)

// Result contains aggregate metadata only; payloads, error messages, and row
// identifiers are deliberately never returned or logged.
type Result struct {
	Deleted       int64     `json:"deleted"`
	Batches       int       `json:"batches"`
	Cutoff        time.Time `json:"cutoff"`
	RetentionDays int       `json:"retentionDays"`
}

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// Run deletes resolved tasks whose resolvedAt timestamp is older than the
// retention cutoff. Unresolved rows and resolved rows with a NULL resolvedAt
// are preserved. Each batch is a separate statement/transaction. The caller
// must hold the job's advisory lock on the same pinned database connection.
func Run(
	ctx context.Context,
	db queryer,
	retentionDays, batchSize int,
	now time.Time,
) (Result, error) {
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
			return result, fmt.Errorf("delete resolved failed-task batch: %w", err)
		}

		var batchDeleted int64
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				_ = rows.Close()
				return result, fmt.Errorf("read deleted failed-task id: %w", err)
			}
			batchDeleted++
		}
		rowsErr := rows.Err()
		closeErr := rows.Close()
		if rowsErr != nil {
			return result, fmt.Errorf("iterate deleted failed-task rows: %w", rowsErr)
		}
		if closeErr != nil {
			return result, fmt.Errorf("close failed-task retention rows: %w", closeErr)
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
		SELECT id
		FROM "failed_background_tasks"
		WHERE "resolved" = TRUE
		  AND "resolvedAt" IS NOT NULL
		  AND "resolvedAt" < $1
		ORDER BY "resolvedAt" ASC, id ASC
		LIMIT $2
		FOR UPDATE SKIP LOCKED
	)
	DELETE FROM "failed_background_tasks" AS task
	USING doomed
	WHERE task.id = doomed.id
	RETURNING task.id
`
