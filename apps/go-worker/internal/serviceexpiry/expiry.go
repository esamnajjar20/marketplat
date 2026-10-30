// Package serviceexpiry expires unanswered provider service requests and
// persists their in-app notification + push-dispatch intent in the same SQL
// statement. The caller must hold the job's shared advisory lock.
package serviceexpiry

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const (
	DefaultTTLDays   = 7
	MaxTTLDays       = 3650
	DefaultBatchSize = 200
	MaxBatchSize     = 1000
	MaxBatches       = 50 // Preserve the Express job's 10,000-row ceiling.
)

type Result struct {
	Expired         int64    `json:"expired"`
	Notified        int64    `json:"notified"`
	Batches         int      `json:"batches"`
	TTLDays         int      `json:"ttlDays"`
	Cutoff          string   `json:"cutoff"`
	EvaluatedAt     string   `json:"evaluatedAt"`
	LimitReached    bool     `json:"limitReached"`
	NotificationIDs []string `json:"notificationIds"`
}

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// Run processes at most MaxBatches batches. Request status transitions and
// notification/push-dispatch creation are committed in one PostgreSQL
// statement per batch, so a crash cannot leave an expired request without its
// durable notification intent. The conditional status predicate protects a
// request that a provider answered concurrently.
func Run(ctx context.Context, db queryer, ttlDays, batchSize int, now time.Time) (Result, error) {
	if ttlDays < 1 || ttlDays > MaxTTLDays {
		return Result{}, fmt.Errorf("ttlDays must be between 1 and %d", MaxTTLDays)
	}
	if batchSize < 1 || batchSize > MaxBatchSize {
		return Result{}, fmt.Errorf("batchSize must be between 1 and %d", MaxBatchSize)
	}

	now = now.UTC()
	cutoff := now.Add(-time.Duration(ttlDays) * 24 * time.Hour)
	result := Result{
		TTLDays:         ttlDays,
		Cutoff:          cutoff.Format(time.RFC3339Nano),
		EvaluatedAt:     now.Format(time.RFC3339Nano),
		NotificationIDs: make([]string, 0),
	}

	for batch := 0; batch < MaxBatches; batch++ {
		rows, err := db.QueryContext(ctx, expireBatchSQL, cutoff, batchSize, now, ttlDays)
		if err != nil {
			return result, fmt.Errorf("expire service requests batch: %w", err)
		}
		var processed int64
		for rows.Next() {
			var requestID string
			var notificationID sql.NullString
			if err := rows.Scan(&requestID, &notificationID); err != nil {
				_ = rows.Close()
				return result, fmt.Errorf("read expired service request: %w", err)
			}
			processed++
			if notificationID.Valid && notificationID.String != "" {
				result.NotificationIDs = append(result.NotificationIDs, notificationID.String)
			}
		}
		rowsErr := rows.Err()
		closeErr := rows.Close()
		if rowsErr != nil {
			return result, fmt.Errorf("iterate expired service requests: %w", rowsErr)
		}
		if closeErr != nil {
			return result, fmt.Errorf("close expired service request rows: %w", closeErr)
		}

		result.Expired += processed
		if processed == 0 {
			break
		}
		result.Batches++
		if processed < int64(batchSize) {
			break
		}
		if batch == MaxBatches-1 {
			result.LimitReached = true
		}
	}
	result.Notified = int64(len(result.NotificationIDs))
	return result, nil
}

const expireBatchSQL = `
WITH due AS (
    SELECT sr."id", sr."customerId", listing."title" AS "listingTitle"
    FROM "service_requests" AS sr
    INNER JOIN "service_listings" AS listing ON listing."id" = sr."listingId"
    WHERE sr."status" = 'PENDING'
      AND sr."createdAt" < $1
    ORDER BY sr."createdAt" ASC, sr."id" ASC
    LIMIT $2
    FOR UPDATE OF sr SKIP LOCKED
), expired AS (
    UPDATE "service_requests" AS request
    SET "status" = 'EXPIRED', "updatedAt" = $3
    FROM due
    WHERE request."id" = due."id"
      AND request."status" = 'PENDING'
      AND request."createdAt" < $1
    RETURNING request."id", request."customerId", due."listingTitle"
), eligible AS (
    SELECT e.*
    FROM expired e
    INNER JOIN "users" u ON u."id" = e."customerId"
    WHERE CASE jsonb_typeof(u."notificationPreferences" -> 'serviceQuotes')
        WHEN 'boolean' THEN COALESCE((u."notificationPreferences" ->> 'serviceQuotes')::boolean, TRUE)
        WHEN 'null' THEN FALSE
        WHEN 'number' THEN COALESCE((u."notificationPreferences" ->> 'serviceQuotes')::numeric <> 0, FALSE)
        WHEN 'string' THEN COALESCE((u."notificationPreferences" ->> 'serviceQuotes') <> '', FALSE)
        ELSE TRUE
    END
), inserted AS (
    INSERT INTO "notifications"
        ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || e."id"),
        'service-request-expired:' || e."id",
        e."customerId",
        'SERVICE_REQUEST_UPDATE',
        'انتهت مهلة طلبك',
        LEFT('لم يردّ مقدم الخدمة على طلبك "' || e."listingTitle" || '" خلال ' || $4::text ||
            ' أيام فتم إغلاقه — يمكنك تقديم طلب جديد أو اختيار مقدم خدمة آخر', 500),
        jsonb_build_object('requestId', e."id", 'status', 'EXPIRED'),
        NOW()
    FROM eligible e
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
            'url', '/service-requests/' || (n."data" ->> 'requestId'),
            'tag', 'service-request-' || (n."data" ->> 'requestId'),
            'type', n."type"::text
        ),
        'notification-push:' || n."id"
    FROM inserted n
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id"
)
SELECT e."id", inserted."id"
FROM expired e
LEFT JOIN inserted ON inserted."data" ->> 'requestId' = e."id"
ORDER BY e."id" ASC
`
