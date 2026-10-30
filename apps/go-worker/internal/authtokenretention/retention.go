// Package authtokenretention removes unusable authentication tokens in bounded
// batches. The package returns aggregate counts only; token values and row IDs
// are never exposed to callers or logs.
package authtokenretention

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const (
	DefaultBatchSize = 500
	MaxBatchSize     = 5000
)

// Result describes a completed auth-token retention pass.
type Result struct {
	Deleted                  int64 `json:"deleted"`
	Batches                  int   `json:"batches"`
	PasswordResetDeleted     int64 `json:"passwordResetDeleted"`
	EmailVerificationDeleted int64 `json:"emailVerificationDeleted"`
}

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// Run removes password-reset tokens that are expired or already used, matching
// the existing Express cleanup policy. Email-verification tokens are removed
// only after expiry: used verification tokens are intentionally retained until
// then as an audit trail, matching auth.service.ts.
//
// Each DELETE is a bounded, independently committed statement. The caller must
// hold the job's PostgreSQL advisory lock on the same pinned connection.
func Run(ctx context.Context, db queryer, batchSize int, now time.Time) (Result, error) {
	if batchSize < 1 || batchSize > MaxBatchSize {
		return Result{}, fmt.Errorf("batchSize must be between 1 and %d", MaxBatchSize)
	}

	result := Result{}
	now = now.UTC()

	passwordResetDeleted, passwordResetBatches, err := runBatches(
		ctx,
		db,
		passwordResetBatchSQL,
		batchSize,
		now,
		"password reset token",
	)
	result.PasswordResetDeleted = passwordResetDeleted
	result.Deleted += passwordResetDeleted
	result.Batches += passwordResetBatches
	if err != nil {
		return result, err
	}

	emailVerificationDeleted, emailVerificationBatches, err := runBatches(
		ctx,
		db,
		emailVerificationBatchSQL,
		batchSize,
		now,
		"email verification token",
	)
	result.EmailVerificationDeleted = emailVerificationDeleted
	result.Deleted += emailVerificationDeleted
	result.Batches += emailVerificationBatches
	if err != nil {
		return result, err
	}

	return result, nil
}

func runBatches(
	ctx context.Context,
	db queryer,
	query string,
	batchSize int,
	now time.Time,
	label string,
) (int64, int, error) {
	var totalDeleted int64
	var batches int

	for {
		rows, err := db.QueryContext(ctx, query, now, batchSize)
		if err != nil {
			return totalDeleted, batches, fmt.Errorf("delete %s batch: %w", label, err)
		}

		var batchDeleted int64
		for rows.Next() {
			var id string
			if err := rows.Scan(&id); err != nil {
				_ = rows.Close()
				return totalDeleted, batches, fmt.Errorf("read deleted %s id: %w", label, err)
			}
			batchDeleted++
		}
		rowsErr := rows.Err()
		closeErr := rows.Close()
		if rowsErr != nil {
			return totalDeleted, batches, fmt.Errorf("iterate deleted %s rows: %w", label, rowsErr)
		}
		if closeErr != nil {
			return totalDeleted, batches, fmt.Errorf("close %s retention rows: %w", label, closeErr)
		}

		totalDeleted += batchDeleted
		if batchDeleted == 0 {
			break
		}
		batches++
		if batchDeleted < int64(batchSize) {
			break
		}
	}

	return totalDeleted, batches, nil
}

const passwordResetBatchSQL = `
	WITH doomed AS (
		SELECT id
		FROM "password_reset_tokens"
		WHERE "expiresAt" < $1 OR "used" = TRUE
		ORDER BY "expiresAt" ASC, id ASC
		LIMIT $2
	)
	DELETE FROM "password_reset_tokens" AS t
	USING doomed
	WHERE t.id = doomed.id
	RETURNING t.id
`

const emailVerificationBatchSQL = `
	WITH doomed AS (
		SELECT id
		FROM "email_verification_tokens"
		WHERE "expiresAt" < $1
		ORDER BY "expiresAt" ASC, id ASC
		LIMIT $2
	)
	DELETE FROM "email_verification_tokens" AS t
	USING doomed
	WHERE t.id = doomed.id
	RETURNING t.id
`
