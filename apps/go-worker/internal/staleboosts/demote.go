// Package staleboosts removes featured/pinned flags from stale active ads.
// It deliberately leaves ad status and all other ad fields unchanged.
package staleboosts

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const (
	DefaultStaleDays = 60
	MaxStaleDays     = 3650
	DefaultBatchSize = 1000
	MaxBatchSize     = 5000
)

type Result struct {
	Candidates     int64     `json:"candidates"`
	Updated        int64     `json:"updated"`
	Batches        int       `json:"batches"`
	OlderThan      time.Time `json:"olderThan"`
	StaleBoostDays int       `json:"staleBoostDays"`
	DryRun         bool      `json:"dryRun"`
}

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// Run counts and optionally demotes stale ACTIVE ads in bounded batches. The
// caller must hold the shared advisory lock. updatedAt is advanced exactly as
// Prisma updateMany does, while all non-boost fields remain untouched.
func Run(ctx context.Context, db queryer, staleDays, batchSize int, dryRun bool, now time.Time) (Result, error) {
	if staleDays < 1 || staleDays > MaxStaleDays {
		return Result{}, fmt.Errorf("staleBoostDays must be between 1 and %d", MaxStaleDays)
	}
	if batchSize < 1 || batchSize > MaxBatchSize {
		return Result{}, fmt.Errorf("batchSize must be between 1 and %d", MaxBatchSize)
	}

	now = now.UTC()
	cutoff := now.Add(-time.Duration(staleDays) * 24 * time.Hour)
	result := Result{OlderThan: cutoff, StaleBoostDays: staleDays, DryRun: dryRun}
	countRows, err := db.QueryContext(ctx, countCandidatesSQL, cutoff)
	if err != nil {
		return result, fmt.Errorf("count stale boosted ads: %w", err)
	}
	if !countRows.Next() {
		rowsErr := countRows.Err()
		_ = countRows.Close()
		if rowsErr != nil {
			return result, fmt.Errorf("read stale boosted ad count: %w", rowsErr)
		}
		return result, fmt.Errorf("stale boosted ad count query returned no rows")
	}
	if err := countRows.Scan(&result.Candidates); err != nil {
		_ = countRows.Close()
		return result, fmt.Errorf("scan stale boosted ad count: %w", err)
	}
	if err := countRows.Close(); err != nil {
		return result, fmt.Errorf("close stale boosted ad count rows: %w", err)
	}
	if dryRun || result.Candidates == 0 {
		return result, nil
	}

	for {
		rows, err := db.QueryContext(ctx, demoteBatchSQL, cutoff, now, batchSize)
		if err != nil {
			return result, fmt.Errorf("demote stale boosted ads batch: %w", err)
		}
		var updated int64
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				_ = rows.Close()
				return result, fmt.Errorf("read demoted ad id: %w", err)
			}
			updated++
		}
		rowsErr := rows.Err()
		closeErr := rows.Close()
		if rowsErr != nil {
			return result, fmt.Errorf("iterate demoted ad rows: %w", rowsErr)
		}
		if closeErr != nil {
			return result, fmt.Errorf("close demoted ad rows: %w", closeErr)
		}
		result.Updated += updated
		if updated == 0 {
			break
		}
		result.Batches++
		if updated < int64(batchSize) {
			break
		}
	}
	return result, nil
}

const countCandidatesSQL = `
SELECT COUNT(*)::bigint
FROM "ads"
WHERE "status" = 'ACTIVE'
  AND "updatedAt" < $1
  AND ("isFeatured" = TRUE OR "isPinned" = TRUE)
`

const demoteBatchSQL = `
WITH stale AS (
    SELECT id
    FROM "ads"
    WHERE "status" = 'ACTIVE'
      AND "updatedAt" < $1
      AND ("isFeatured" = TRUE OR "isPinned" = TRUE)
    ORDER BY "updatedAt" ASC, id ASC
    LIMIT $3
    FOR UPDATE SKIP LOCKED
)
UPDATE "ads" AS ad
SET "isFeatured" = FALSE,
    "isPinned" = FALSE,
    "updatedAt" = $2
FROM stale
WHERE ad.id = stale.id
  AND ad."status" = 'ACTIVE'
RETURNING ad.id
`
