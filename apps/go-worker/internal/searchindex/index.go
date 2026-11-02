// Package searchindex refreshes the PostgreSQL-backed autocomplete projection.
// The primary full-text search indexes remain PostgreSQL GIN indexes maintained
// transactionally by PostgreSQL; this package owns the rebuildable suggestion
// materialized view used by the high-frequency autocomplete endpoint.
package searchindex

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"strings"
	"time"
)

const (
	AdvisoryLockID  int64 = 731904303
	FreshnessWindow       = 30 * time.Minute
	ViewName              = "search_suggestions_mv"
	StateTableName        = "search_suggestion_index_state"
)

type Result struct {
	Refreshed      bool      `json:"refreshed"`
	SkippedLocked  bool      `json:"skippedLocked"`
	IndexedRows    int64     `json:"indexedRows"`
	DurationMillis int64     `json:"durationMillis"`
	RefreshedAt    time.Time `json:"refreshedAt,omitempty"`
}

type Status struct {
	RefreshedAt    *time.Time `json:"refreshedAt"`
	IndexedRows    int64      `json:"indexedRows"`
	DurationMillis int64      `json:"durationMillis"`
	LastError      string     `json:"lastError,omitempty"`
	Fresh          bool       `json:"fresh"`
}

// IsFresh applies the same freshness rule used by the API autocomplete query.
func IsFresh(refreshedAt *time.Time, now time.Time) bool {
	if refreshedAt == nil {
		return false
	}
	age := now.Sub(*refreshedAt)
	return age >= 0 && age <= FreshnessWindow
}

// Refresh takes a session advisory lock and atomically publishes a new
// materialized-view generation from PostgreSQL's perspective. CONCURRENTLY is
// used after the first population so readers can continue using the previous
// generation while PostgreSQL builds the replacement.
func Refresh(ctx context.Context, db *sql.DB) (result Result, err error) {
	if db == nil {
		return result, errors.New("search index database is required")
	}
	conn, err := db.Conn(ctx)
	if err != nil {
		return result, fmt.Errorf("acquire search index connection: %w", err)
	}
	defer conn.Close()

	var acquired bool
	if err := conn.QueryRowContext(ctx, `SELECT pg_try_advisory_lock($1)`, AdvisoryLockID).Scan(&acquired); err != nil {
		return result, fmt.Errorf("acquire search index advisory lock: %w", err)
	}
	if !acquired {
		result.SkippedLocked = true
		return result, nil
	}
	defer func() {
		unlockCtx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
		defer cancel()
		var unlocked bool
		if unlockErr := conn.QueryRowContext(unlockCtx, `SELECT pg_advisory_unlock($1)`, AdvisoryLockID).Scan(&unlocked); unlockErr != nil && err == nil {
			err = fmt.Errorf("release search index advisory lock: %w", unlockErr)
		} else if unlockErr == nil && !unlocked && err == nil {
			err = errors.New("search index advisory lock was not held at release")
		}
	}()

	started := time.Now()
	var populated bool
	if err := conn.QueryRowContext(ctx, `
		SELECT COALESCE((
			SELECT ispopulated
			FROM pg_matviews
			WHERE schemaname = current_schema() AND matviewname = $1
		), false)
	`, ViewName).Scan(&populated); err != nil {
		return result, fmt.Errorf("inspect search suggestion materialized view: %w", err)
	}

	refreshSQL := `REFRESH MATERIALIZED VIEW "search_suggestions_mv"`
	if populated {
		refreshSQL = `REFRESH MATERIALIZED VIEW CONCURRENTLY "search_suggestions_mv"`
	}
	if _, err := conn.ExecContext(ctx, refreshSQL); err != nil {
		persistError(conn, err)
		return result, fmt.Errorf("refresh search suggestion materialized view: %w", err)
	}
	if _, err := conn.ExecContext(ctx, `ANALYZE "search_suggestions_mv"`); err != nil {
		persistError(conn, err)
		return result, fmt.Errorf("analyze search suggestion materialized view: %w", err)
	}

	if err := conn.QueryRowContext(ctx, `SELECT COUNT(*) FROM "search_suggestions_mv"`).Scan(&result.IndexedRows); err != nil {
		persistError(conn, err)
		return result, fmt.Errorf("count indexed search suggestions: %w", err)
	}
	result.DurationMillis = time.Since(started).Milliseconds()
	if err := conn.QueryRowContext(ctx, `
		UPDATE "search_suggestion_index_state"
		SET "refreshedAt" = NOW(),
		    "indexedRows" = $1,
		    "lastDurationMs" = $2,
		    "lastError" = NULL,
		    "updatedAt" = NOW()
		WHERE "singletonId" = 1
		RETURNING "refreshedAt"
	`, result.IndexedRows, result.DurationMillis).Scan(&result.RefreshedAt); err != nil {
		return result, fmt.Errorf("record search suggestion index refresh: %w", err)
	}
	result.Refreshed = true
	return result, nil
}

func ReadStatus(ctx context.Context, db *sql.DB) (Status, error) {
	if db == nil {
		return Status{}, errors.New("search index database is required")
	}
	var status Status
	var refreshedAt sql.NullTime
	if err := db.QueryRowContext(ctx, `
		SELECT "refreshedAt", "indexedRows", COALESCE("lastDurationMs", 0), COALESCE("lastError", '')
		FROM "search_suggestion_index_state"
		WHERE "singletonId" = 1
	`).Scan(&refreshedAt, &status.IndexedRows, &status.DurationMillis, &status.LastError); err != nil {
		return status, fmt.Errorf("read search suggestion index status: %w", err)
	}
	if refreshedAt.Valid {
		value := refreshedAt.Time
		status.RefreshedAt = &value
		status.Fresh = IsFresh(status.RefreshedAt, time.Now().UTC())
	}
	status.LastError = strings.TrimSpace(status.LastError)
	return status, nil
}

func persistError(conn *sql.Conn, refreshErr error) {
	message := strings.TrimSpace(refreshErr.Error())
	if len(message) > 1000 {
		message = message[:1000]
	}
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()
	_, _ = conn.ExecContext(ctx, `
		UPDATE "search_suggestion_index_state"
		SET "lastError" = $1, "updatedAt" = NOW()
		WHERE "singletonId" = 1
	`, message)
}
