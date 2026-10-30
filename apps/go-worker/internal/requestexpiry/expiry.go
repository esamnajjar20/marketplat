// Package requestexpiry expires open marketplace requests whose explicit
// expiresAt deadline has passed. Rows without an expiresAt remain open.
package requestexpiry

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const DefaultBatchSize = 1000
const MaxBatchSize = 5000

type Result struct {
	Expired     int64  `json:"expired"`
	Batches     int    `json:"batches"`
	EvaluatedAt string `json:"evaluatedAt"`
}

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// Run expires requests in bounded statements. The caller must hold the shared
// PostgreSQL advisory lock for the entire run. The conditional status predicate
// prevents overwriting a request accepted/cancelled concurrently.
func Run(ctx context.Context, db queryer, batchSize int, now time.Time) (Result, error) {
	if batchSize < 1 || batchSize > MaxBatchSize {
		return Result{}, fmt.Errorf("batchSize must be between 1 and %d", MaxBatchSize)
	}
	now = now.UTC()
	result := Result{EvaluatedAt: now.Format(time.RFC3339Nano)}
	for {
		rows, err := db.QueryContext(ctx, expireBatchSQL, now, batchSize)
		if err != nil {
			return result, fmt.Errorf("expire open requests batch: %w", err)
		}
		var expired int64
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				_ = rows.Close()
				return result, fmt.Errorf("read expired request id: %w", err)
			}
			expired++
		}
		rowsErr := rows.Err()
		closeErr := rows.Close()
		if rowsErr != nil {
			return result, fmt.Errorf("iterate expired request rows: %w", rowsErr)
		}
		if closeErr != nil {
			return result, fmt.Errorf("close expired request rows: %w", closeErr)
		}
		result.Expired += expired
		if expired == 0 {
			break
		}
		result.Batches++
		if expired < int64(batchSize) {
			break
		}
	}
	return result, nil
}

const expireBatchSQL = `
WITH due AS (
    SELECT id
    FROM "requests"
    WHERE "status" = 'OPEN'
      AND "expiresAt" IS NOT NULL
      AND "expiresAt" <= $1
    ORDER BY "expiresAt" ASC, id ASC
    LIMIT $2
    FOR UPDATE SKIP LOCKED
)
UPDATE "requests" AS request
SET "status" = 'EXPIRED', "updatedAt" = $1
FROM due
WHERE request.id = due.id
  AND request."status" = 'OPEN'
RETURNING request.id
`
