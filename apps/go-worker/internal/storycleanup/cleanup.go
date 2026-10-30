// Package storycleanup deletes expired story media before deleting its database row.
// A Cloudinary failure intentionally leaves the row in place for the next sweep.
package storycleanup

import (
	"context"
	"database/sql"
	"fmt"
	"sync"
	"time"
)

const (
	DefaultBatchSize  = 50
	MaxBatchSize      = 100
	MaxBatches        = 6
	DeleteConcurrency = 8
)

type MediaDeleter interface {
	Delete(context.Context, string) error
}

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

type candidate struct {
	id        string
	publicID  sql.NullString
	expiresAt time.Time
}

type Result struct {
	Scanned           int64  `json:"scanned"`
	Deleted           int64  `json:"deleted"`
	MediaDeleteFailed int64  `json:"mediaDeleteFailed"`
	RowDeleteFailed   int64  `json:"rowDeleteFailed"`
	Batches           int    `json:"batches"`
	LimitReached      bool   `json:"limitReached"`
	EvaluatedAt       string `json:"evaluatedAt"`
}

// Run is called while the caller holds the stories-cleanup advisory lock.
// It uses keyset pagination so a failed media deletion is not re-selected
// repeatedly in the same run. If Cloudinary deletion succeeds but the DB delete
// fails, the next run safely retries: Cloudinary's "not found" is idempotent.
func Run(ctx context.Context, db queryer, media MediaDeleter, batchSize int, now time.Time) (Result, error) {
	if media == nil {
		return Result{}, fmt.Errorf("Cloudinary media deleter is required")
	}
	if batchSize < 1 || batchSize > MaxBatchSize {
		return Result{}, fmt.Errorf("batchSize must be between 1 and %d", MaxBatchSize)
	}
	now = now.UTC()
	result := Result{EvaluatedAt: now.Format(time.RFC3339Nano)}
	var cursorTime sql.NullTime
	var cursorID string

	for batch := 0; batch < MaxBatches; batch++ {
		query := firstBatchSQL
		args := []any{now, batchSize}
		if cursorTime.Valid {
			query = nextBatchSQL
			args = []any{now, cursorTime.Time, cursorID, batchSize}
		}
		rows, err := db.QueryContext(ctx, query, args...)
		if err != nil {
			return result, fmt.Errorf("select expired stories: %w", err)
		}
		items := make([]candidate, 0, batchSize)
		for rows.Next() {
			var item candidate
			if err := rows.Scan(&item.id, &item.publicID, &item.expiresAt); err != nil {
				_ = rows.Close()
				return result, fmt.Errorf("scan expired story: %w", err)
			}
			items = append(items, item)
		}
		rowsErr := rows.Err()
		closeErr := rows.Close()
		if rowsErr != nil {
			return result, fmt.Errorf("iterate expired stories: %w", rowsErr)
		}
		if closeErr != nil {
			return result, fmt.Errorf("close expired stories: %w", closeErr)
		}
		if len(items) == 0 {
			break
		}

		last := items[len(items)-1]
		cursorTime = sql.NullTime{Time: last.expiresAt, Valid: true}
		cursorID = last.id
		result.Scanned += int64(len(items))
		result.Batches++

		mediaDeleted := make([]bool, len(items))
		jobs := make(chan int)
		var workers sync.WaitGroup
		workerCount := DeleteConcurrency
		if len(items) < workerCount {
			workerCount = len(items)
		}
		workers.Add(workerCount)
		for worker := 0; worker < workerCount; worker++ {
			go func() {
				defer workers.Done()
				for index := range jobs {
					if !items[index].publicID.Valid || items[index].publicID.String == "" {
						mediaDeleted[index] = true
						continue
					}
					if err := media.Delete(ctx, items[index].publicID.String); err != nil {
						continue
					}
					mediaDeleted[index] = true
				}
			}()
		}
		for index := range items {
			jobs <- index
		}
		close(jobs)
		workers.Wait()

		for index, item := range items {
			if !mediaDeleted[index] {
				result.MediaDeleteFailed++
				continue
			}
			deleteResult, err := db.ExecContext(ctx, deleteStorySQL, item.id, now)
			if err != nil {
				result.RowDeleteFailed++
				continue
			}
			affected, err := deleteResult.RowsAffected()
			if err != nil {
				result.RowDeleteFailed++
				continue
			}
			if affected > 0 {
				result.Deleted += affected
			}
		}

		if len(items) < batchSize {
			break
		}
		if batch == MaxBatches-1 {
			result.LimitReached = true
		}
	}
	return result, nil
}

const firstBatchSQL = `
SELECT "id", "mediaPublicId", "expiresAt"
FROM "stories"
WHERE "expiresAt" <= $1
ORDER BY "expiresAt" ASC, "id" ASC
LIMIT $2
`

const nextBatchSQL = `
SELECT "id", "mediaPublicId", "expiresAt"
FROM "stories"
WHERE "expiresAt" <= $1
  AND ("expiresAt", "id") > ($2, $3)
ORDER BY "expiresAt" ASC, "id" ASC
LIMIT $4
`

const deleteStorySQL = `
DELETE FROM "stories"
WHERE "id" = $1 AND "expiresAt" <= $2
`
