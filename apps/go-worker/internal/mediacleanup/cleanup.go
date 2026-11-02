// Package mediacleanup processes durable Cloudinary deletion jobs created by
// Express after a best-effort delete fails. It never discovers or deletes
// assets by folder scan: every public ID must have been explicitly enqueued.
package mediacleanup

import (
	"context"
	"database/sql"
	"fmt"
	"strings"
	"sync"
	"time"
)

const (
	DefaultBatchSize = 40
	MaxBatchSize     = 100
	MaxBatches       = 5
	Concurrency      = 6
	MaxAttempts      = 12
	LeaseDuration    = 2 * time.Minute
	Retention        = 30 * 24 * time.Hour
)

type ResourceDeleter interface {
	DeleteResource(context.Context, string, string) error
}

type connection interface {
	BeginTx(context.Context, *sql.TxOptions) (*sql.Tx, error)
}

type job struct {
	id           string
	publicID     string
	resourceType string
	attempts     int
	leaseToken   string
	recovered    bool
}

type Result struct {
	Scanned         int64  `json:"scanned"`
	Deleted         int64  `json:"deleted"`
	Retried         int64  `json:"retried"`
	DeadLettered    int64  `json:"deadLettered"`
	RecoveredLeases int64  `json:"recoveredLeases"`
	LeaseLost       int64  `json:"leaseLost"`
	PrunedCompleted int64  `json:"prunedCompleted"`
	Batches         int    `json:"batches"`
	LimitReached    bool   `json:"limitReached"`
	EvaluatedAt     string `json:"evaluatedAt"`
}

// Run claims a bounded number of due cleanup jobs. The caller holds the shared
// advisory lock for this job; row-level leases are an additional recovery
// boundary for process crashes and ambiguous HTTP timeouts.
func Run(ctx context.Context, db connection, media ResourceDeleter, batchSize int, now time.Time) (Result, error) {
	if db == nil {
		return Result{}, fmt.Errorf("database connection is required")
	}
	if media == nil {
		return Result{}, fmt.Errorf("Cloudinary resource deleter is required")
	}
	if batchSize < 1 || batchSize > MaxBatchSize {
		return Result{}, fmt.Errorf("batchSize must be between 1 and %d", MaxBatchSize)
	}
	now = now.UTC()
	result := Result{EvaluatedAt: now.Format(time.RFC3339Nano)}

	for batch := 0; batch < MaxBatches; batch++ {
		items, err := claimBatch(ctx, db, now, batchSize)
		if err != nil {
			return result, fmt.Errorf("claim media cleanup jobs: %w", err)
		}
		if len(items) == 0 {
			break
		}
		result.Batches++
		result.Scanned += int64(len(items))

		outcomes := make([]error, len(items))
		var workers sync.WaitGroup
		workerCount := Concurrency
		if len(items) < workerCount {
			workerCount = len(items)
		}
		indices := make(chan int)
		workers.Add(workerCount)
		for worker := 0; worker < workerCount; worker++ {
			go func() {
				defer workers.Done()
				for index := range indices {
					deleteCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
					outcomes[index] = media.DeleteResource(deleteCtx, items[index].publicID, items[index].resourceType)
					cancel()
				}
			}()
		}
		for index := range items {
			indices <- index
		}
		close(indices)
		workers.Wait()

		for index, item := range items {
			if item.recovered {
				result.RecoveredLeases++
			}
			if outcomes[index] == nil {
				updated, err := markCompleted(ctx, db, item, time.Now().UTC())
				if err != nil {
					return result, fmt.Errorf("mark media cleanup job completed: %w", err)
				}
				if updated {
					result.Deleted++
				} else {
					result.LeaseLost++
				}
				continue
			}
			dead, updated, err := markFailed(ctx, db, item, outcomes[index], time.Now().UTC())
			if err != nil {
				return result, fmt.Errorf("reschedule media cleanup job: %w", err)
			}
			if !updated {
				result.LeaseLost++
			} else if dead {
				result.DeadLettered++
			} else {
				result.Retried++
			}
		}

		if len(items) < batchSize {
			break
		}
		if batch == MaxBatches-1 {
			result.LimitReached = true
		}
	}

	pruned, err := pruneCompleted(ctx, db, now.Add(-Retention))
	if err != nil {
		return result, fmt.Errorf("prune completed media cleanup jobs: %w", err)
	}
	result.PrunedCompleted = pruned
	return result, nil
}

func BackoffForAttempt(attempt int) time.Duration {
	if attempt < 1 {
		attempt = 1
	}
	delay := 5 * time.Minute
	for n := 1; n < attempt && delay < 24*time.Hour; n++ {
		delay *= 2
	}
	if delay > 24*time.Hour {
		delay = 24 * time.Hour
	}
	return delay
}

func claimBatch(ctx context.Context, db connection, now time.Time, limit int) ([]job, error) {
	tx, err := db.BeginTx(ctx, nil)
	if err != nil {
		return nil, err
	}
	defer tx.Rollback()

	rows, err := tx.QueryContext(ctx, claimSQL, now, now.Add(-LeaseDuration), limit)
	if err != nil {
		return nil, err
	}
	items := make([]job, 0, limit)
	for rows.Next() {
		var item job
		if err := rows.Scan(&item.id, &item.publicID, &item.resourceType, &item.attempts, &item.leaseToken, &item.recovered); err != nil {
			_ = rows.Close()
			return nil, err
		}
		items = append(items, item)
	}
	rowsErr := rows.Err()
	closeErr := rows.Close()
	if rowsErr != nil {
		return nil, rowsErr
	}
	if closeErr != nil {
		return nil, closeErr
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return items, nil
}

func markCompleted(ctx context.Context, db connection, item job, now time.Time) (bool, error) {
	result, err := dbExec(ctx, db, `
UPDATE "media_cleanup_jobs"
SET "status" = 'COMPLETED', "completedAt" = $3, "lockedAt" = NULL,
    "leaseToken" = NULL, "lastError" = NULL, "updatedAt" = $3
WHERE "id" = $1::uuid AND "leaseToken" = $2::uuid AND "status" = 'PROCESSING'
`, item.id, item.leaseToken, now)
	if err != nil {
		return false, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected == 1, nil
}

func markFailed(ctx context.Context, db connection, item job, failure error, now time.Time) (bool, bool, error) {
	dead := item.attempts >= MaxAttempts
	status := "PENDING"
	nextAttempt := now.Add(BackoffForAttempt(item.attempts))
	if dead {
		status = "DEAD"
		nextAttempt = now
	}
	message := strings.TrimSpace(failure.Error())
	if len(message) > 1800 {
		message = message[:1800]
	}
	result, err := dbExec(ctx, db, `
UPDATE "media_cleanup_jobs"
SET "status" = $3, "nextAttemptAt" = $4, "lockedAt" = NULL,
    "leaseToken" = NULL, "lastError" = $5, "updatedAt" = $6
WHERE "id" = $1::uuid AND "leaseToken" = $2::uuid AND "status" = 'PROCESSING'
`, item.id, item.leaseToken, status, nextAttempt, message, now)
	if err != nil {
		return dead, false, err
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return dead, false, err
	}
	return dead, affected == 1, nil
}

func dbExec(ctx context.Context, db connection, query string, args ...any) (sql.Result, error) {
	// *sql.Conn and *sql.DB both expose ExecContext. A tiny local interface
	// avoids tying the package to either concrete owner.
	executor, ok := db.(interface {
		ExecContext(context.Context, string, ...any) (sql.Result, error)
	})
	if !ok {
		return nil, fmt.Errorf("database connection does not support ExecContext")
	}
	return executor.ExecContext(ctx, query, args...)
}

func pruneCompleted(ctx context.Context, db connection, cutoff time.Time) (int64, error) {
	executor, ok := db.(interface {
		ExecContext(context.Context, string, ...any) (sql.Result, error)
	})
	if !ok {
		return 0, fmt.Errorf("database connection does not support ExecContext")
	}
	result, err := executor.ExecContext(ctx, `
DELETE FROM "media_cleanup_jobs"
WHERE "id" IN (
  SELECT "id" FROM "media_cleanup_jobs"
  WHERE "status" = 'COMPLETED' AND "completedAt" < $1
  ORDER BY "completedAt" ASC
  LIMIT 500
)
`, cutoff)
	if err != nil {
		return 0, err
	}
	return result.RowsAffected()
}

const claimSQL = `
WITH candidates AS (
  SELECT "id", "status" AS "previousStatus"
  FROM "media_cleanup_jobs"
  WHERE (
    "status" = 'PENDING' AND "nextAttemptAt" <= $1
  ) OR (
    "status" = 'PROCESSING' AND "lockedAt" <= $2
  )
  ORDER BY "nextAttemptAt" ASC, "createdAt" ASC
  FOR UPDATE SKIP LOCKED
  LIMIT $3
)
UPDATE "media_cleanup_jobs" AS jobs
SET "status" = 'PROCESSING', "attempts" = jobs."attempts" + 1,
    "lockedAt" = $1, "leaseToken" = gen_random_uuid(), "updatedAt" = $1
FROM candidates
WHERE jobs."id" = candidates."id"
RETURNING jobs."id"::text, jobs."publicId", jobs."resourceType", jobs."attempts",
          jobs."leaseToken"::text, (candidates."previousStatus" = 'PROCESSING')
`
