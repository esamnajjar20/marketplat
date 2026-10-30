// Package adexpiry handles the 60-day ad lifecycle's seven-day warning and
// terminal expiry. Each state change, in-app notification, and push-dispatch
// row is committed by one SQL statement.
package adexpiry

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const (
	WarningWindowDays = 7
	DefaultBatchSize  = 500
	MaxBatchSize      = 1000
	MaxBatches        = 20 // Bounded independently for warnings and terminal expiry.
)

type Result struct {
	Warned              int64    `json:"warned"`
	Expired             int64    `json:"expired"`
	Notified            int64    `json:"notified"`
	WarningBatches      int      `json:"warningBatches"`
	ExpiryBatches       int      `json:"expiryBatches"`
	WarningLimitReached bool     `json:"warningLimitReached"`
	ExpiryLimitReached  bool     `json:"expiryLimitReached"`
	EvaluatedAt         string   `json:"evaluatedAt"`
	WarningCutoff       string   `json:"warningCutoff"`
	NotificationIDs     []string `json:"notificationIds"`
}

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// Run sends at most MaxBatches warning batches and MaxBatches expiry batches.
// Rows are locked with SKIP LOCKED, and every notification/push intent is
// stored atomically with its corresponding ad marker/status update.
func Run(ctx context.Context, db queryer, batchSize int, now time.Time) (Result, error) {
	if batchSize < 1 || batchSize > MaxBatchSize {
		return Result{}, fmt.Errorf("batchSize must be between 1 and %d", MaxBatchSize)
	}
	now = now.UTC()
	warningCutoff := now.Add(WarningWindowDays * 24 * time.Hour)
	result := Result{
		EvaluatedAt:     now.Format(time.RFC3339Nano),
		WarningCutoff:   warningCutoff.Format(time.RFC3339Nano),
		NotificationIDs: make([]string, 0),
	}

	for batch := 0; batch < MaxBatches; batch++ {
		processed, notificationIDs, err := runBatch(ctx, db, warningBatchSQL, now, warningCutoff, batchSize)
		if err != nil {
			return result, fmt.Errorf("process ad-expiry warnings: %w", err)
		}
		result.Warned += processed
		result.NotificationIDs = append(result.NotificationIDs, notificationIDs...)
		if processed == 0 {
			break
		}
		result.WarningBatches++
		if processed < int64(batchSize) {
			break
		}
		if batch == MaxBatches-1 {
			result.WarningLimitReached = true
		}
	}

	for batch := 0; batch < MaxBatches; batch++ {
		processed, notificationIDs, err := runBatch(ctx, db, expiryBatchSQL, now, batchSize)
		if err != nil {
			return result, fmt.Errorf("process expired ads: %w", err)
		}
		result.Expired += processed
		result.NotificationIDs = append(result.NotificationIDs, notificationIDs...)
		if processed == 0 {
			break
		}
		result.ExpiryBatches++
		if processed < int64(batchSize) {
			break
		}
		if batch == MaxBatches-1 {
			result.ExpiryLimitReached = true
		}
	}

	result.Notified = int64(len(result.NotificationIDs))
	return result, nil
}

func runBatch(ctx context.Context, db queryer, query string, args ...any) (int64, []string, error) {
	rows, err := db.QueryContext(ctx, query, args...)
	if err != nil {
		return 0, nil, err
	}
	processed := int64(0)
	notificationIDs := make([]string, 0)
	for rows.Next() {
		var adID string
		var notificationID sql.NullString
		if err := rows.Scan(&adID, &notificationID); err != nil {
			_ = rows.Close()
			return processed, notificationIDs, err
		}
		processed++
		if notificationID.Valid && notificationID.String != "" {
			notificationIDs = append(notificationIDs, notificationID.String)
		}
	}
	rowsErr := rows.Err()
	closeErr := rows.Close()
	if rowsErr != nil {
		return processed, notificationIDs, rowsErr
	}
	if closeErr != nil {
		return processed, notificationIDs, closeErr
	}
	return processed, notificationIDs, nil
}

const warningBatchSQL = `
WITH due AS (
    SELECT ad."id", ad."userId", ad."title", ad."expiresAt"
    FROM "ads" AS ad
    WHERE ad."status" = 'ACTIVE'
      AND ad."flaggedForReview" = FALSE
      AND ad."expiresAt" > $1
      AND ad."expiresAt" <= $2
      AND ad."expirationNotifiedAt" IS NULL
    ORDER BY ad."expiresAt" ASC, ad."id" ASC
    LIMIT $3
    FOR UPDATE OF ad SKIP LOCKED
), warned AS (
    UPDATE "ads" AS ad
    SET "expirationNotifiedAt" = $1,
        "updatedAt" = $1
    FROM due
    WHERE ad."id" = due."id"
      AND ad."status" = 'ACTIVE'
      AND ad."expirationNotifiedAt" IS NULL
    RETURNING ad."id", ad."userId", due."title", due."expiresAt"
), inserted AS (
    INSERT INTO "notifications"
        ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || w."id"),
        'ad-expiring-soon:' || w."id",
        w."userId",
        'AD_EXPIRING_SOON',
        'إعلانك يقترب من الانتهاء',
        LEFT('سينتهي إعلان "' || w."title" || '" خلال 7 أيام تقريبًا', 500),
        jsonb_build_object(
            'adId', w."id",
            'expiresAt', to_char(w."expiresAt" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
            'event', 'expiring'
        ),
        NOW()
    FROM warned w
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id", "userId", "type", "title", "body", "data"
), dispatch AS (
    INSERT INTO "notification_push_dispatches"
        ("id", "notificationId", "userId", "payload", "idempotencyKey")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || n."id"),
        n."id",
        n."userId",
        jsonb_build_object(
            'title', n."title",
            'body', n."body",
            'url', '/ads/' || (n."data" ->> 'adId'),
            'tag', 'ad-expiry-' || (n."data" ->> 'adId'),
            'type', n."type"::text
        ),
        'notification-push:' || n."id"
    FROM inserted n
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id"
)
SELECT w."id", inserted."id"
FROM warned w
LEFT JOIN inserted ON inserted."data" ->> 'adId' = w."id"
ORDER BY w."id" ASC
`

const expiryBatchSQL = `
WITH due AS (
    SELECT ad."id", ad."userId", ad."title"
    FROM "ads" AS ad
    WHERE ad."status" = 'ACTIVE'
      AND ad."expiresAt" IS NOT NULL
      AND ad."expiresAt" <= $1
    ORDER BY ad."expiresAt" ASC, ad."id" ASC
    LIMIT $2
    FOR UPDATE OF ad SKIP LOCKED
), expired AS (
    UPDATE "ads" AS ad
    SET "status" = 'EXPIRED',
        "updatedAt" = $1
    FROM due
    WHERE ad."id" = due."id"
      AND ad."status" = 'ACTIVE'
      AND ad."expiresAt" <= $1
    RETURNING ad."id", ad."userId", due."title"
), inserted AS (
    INSERT INTO "notifications"
        ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || e."id"),
        'ad-expired:' || e."id",
        e."userId",
        'AD_EXPIRED',
        'انتهى إعلانك',
        LEFT('انتهت مدة نشر "' || e."title" || '". يمكنك تجديده من إعلاناتك.', 500),
        jsonb_build_object('adId', e."id", 'event', 'expired'),
        NOW()
    FROM expired e
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id", "userId", "type", "title", "body", "data"
), dispatch AS (
    INSERT INTO "notification_push_dispatches"
        ("id", "notificationId", "userId", "payload", "idempotencyKey")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || n."id"),
        n."id",
        n."userId",
        jsonb_build_object(
            'title', n."title",
            'body', n."body",
            'url', '/ads/' || (n."data" ->> 'adId'),
            'tag', 'ad-expired-' || (n."data" ->> 'adId'),
            'type', n."type"::text
        ),
        'notification-push:' || n."id"
    FROM inserted n
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id"
)
SELECT e."id", inserted."id"
FROM expired e
LEFT JOIN inserted ON inserted."data" ->> 'adId' = e."id"
ORDER BY e."id" ASC
`
