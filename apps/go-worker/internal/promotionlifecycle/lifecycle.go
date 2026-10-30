// Package promotionlifecycle advances scheduled promotions and writes owner / store-follower
// notifications together with durable push-dispatch intents in the same SQL statement.
package promotionlifecycle

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const (
	WarningWindowHours = 24
	DefaultBatchSize   = 100
	MaxBatchSize       = 500
	MaxBatches         = 50
)

type Result struct {
	Started         int64    `json:"started"`
	Expiring        int64    `json:"expiring"`
	Expired         int64    `json:"expired"`
	Notified        int64    `json:"notified"`
	StartedBatches  int      `json:"startedBatches"`
	ExpiringBatches int      `json:"expiringBatches"`
	ExpiredBatches  int      `json:"expiredBatches"`
	LimitReached    bool     `json:"limitReached"`
	EvaluatedAt     string   `json:"evaluatedAt"`
	WarningCutoff   string   `json:"warningCutoff"`
	NotificationIDs []string `json:"notificationIds"`
}

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// Run executes the three lifecycle transitions in deterministic order. The caller
// must hold the shared PostgreSQL advisory lock for the duration of this call.
func Run(ctx context.Context, db queryer, batchSize int, now time.Time) (Result, error) {
	if batchSize < 1 || batchSize > MaxBatchSize {
		return Result{}, fmt.Errorf("batchSize must be between 1 and %d", MaxBatchSize)
	}
	now = now.UTC()
	cutoff := now.Add(WarningWindowHours * time.Hour)
	result := Result{
		EvaluatedAt:     now.Format(time.RFC3339Nano),
		WarningCutoff:   cutoff.Format(time.RFC3339Nano),
		NotificationIDs: make([]string, 0),
	}

	phases := []struct {
		name    string
		query   string
		args    []any
		count   *int64
		batches *int
	}{
		{name: "start promotions", query: startedBatchSQL, args: []any{now, batchSize}, count: &result.Started, batches: &result.StartedBatches},
		{name: "warn expiring promotions", query: expiringBatchSQL, args: []any{now, cutoff, batchSize}, count: &result.Expiring, batches: &result.ExpiringBatches},
		{name: "expire promotions", query: expiredBatchSQL, args: []any{now, batchSize}, count: &result.Expired, batches: &result.ExpiredBatches},
	}

	for _, phase := range phases {
		for batch := 0; batch < MaxBatches; batch++ {
			processed, notificationIDs, err := runBatch(ctx, db, phase.query, phase.args...)
			if err != nil {
				return result, fmt.Errorf("%s: %w", phase.name, err)
			}
			*phase.count += processed
			result.NotificationIDs = append(result.NotificationIDs, notificationIDs...)
			if processed == 0 {
				break
			}
			*phase.batches++
			if processed < int64(batchSize) {
				break
			}
			if batch == MaxBatches-1 {
				result.LimitReached = true
			}
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
	defer rows.Close()
	processedPromotions := make(map[string]struct{})
	notificationIDs := make([]string, 0)
	for rows.Next() {
		var promotionID string
		var notificationID sql.NullString
		if err := rows.Scan(&promotionID, &notificationID); err != nil {
			return int64(len(processedPromotions)), notificationIDs, err
		}
		processedPromotions[promotionID] = struct{}{}
		if notificationID.Valid && notificationID.String != "" {
			notificationIDs = append(notificationIDs, notificationID.String)
		}
	}
	if err := rows.Err(); err != nil {
		return int64(len(processedPromotions)), notificationIDs, err
	}
	return int64(len(processedPromotions)), notificationIDs, nil
}

const startedBatchSQL = `
WITH due AS (
    SELECT p."id", p."storeId", p."productId", p."title", product."name" AS "productName"
    FROM "promotions" p
    INNER JOIN "products" product ON product."id" = p."productId"
    WHERE p."status" = 'SCHEDULED'
      AND p."startsAt" <= $1
    ORDER BY p."startsAt" ASC, p."id" ASC
    LIMIT $2
    FOR UPDATE OF p SKIP LOCKED
), started AS (
    UPDATE "promotions" p
    SET "status" = 'ACTIVE', "updatedAt" = $1
    FROM due
    WHERE p."id" = due."id"
      AND p."status" = 'SCHEDULED'
      AND p."startsAt" <= $1
    RETURNING p."id", p."storeId", p."productId", p."title", due."productName"
), owner_recipients AS (
    SELECT
        s."id" AS "promotionId", s."storeId", s."productId", u."id" AS "userId",
        'PROMOTION_STATUS_CHANGE'::text AS "notificationType",
        'بدأ عرضك'::text AS "notificationTitle",
        LEFT('بدأ العرض "' || s."title" || '" على "' || s."productName" || '"', 500) AS "notificationBody",
        jsonb_build_object('promotionId', s."id", 'productId', s."productId", 'event', 'started') AS "notificationData",
        '/my-store?tab=promotions'::text AS "pushUrl",
        'promotion-' || s."id" || '-started' AS "pushTag",
        'promotion-started-owner:' || s."id" AS "idempotencyKey"
    FROM started s
    INNER JOIN "store_details" sd ON sd."id" = s."storeId"
    INNER JOIN "seller_profiles" sp ON sp."id" = sd."sellerProfileId"
    INNER JOIN "users" u ON u."id" = sp."userId"
    WHERE u."notificationPreferences" ->> 'myPromotions' = 'true'
), follower_recipients AS (
    SELECT
        s."id" AS "promotionId", s."storeId", s."productId", u."id" AS "userId",
        'STORE_PROMOTION_STARTED'::text AS "notificationType",
        'عرض جديد'::text AS "notificationTitle",
        LEFT('عرض جديد على "' || s."productName" || '": ' || s."title", 500) AS "notificationBody",
        jsonb_build_object('storeId', s."storeId", 'promotionId', s."id", 'productId', s."productId") AS "notificationData",
        '/stores/' || s."storeId" AS "pushUrl",
        'store-promotion-' || s."id" AS "pushTag",
        'store-promotion-started:' || s."id" || ':' || u."id" AS "idempotencyKey"
    FROM started s
    INNER JOIN "store_followers" sf ON sf."storeId" = s."storeId"
    INNER JOIN "users" u ON u."id" = sf."userId"

), recipients AS (
    SELECT * FROM owner_recipients
    UNION ALL
    SELECT * FROM follower_recipients
), inserted AS (
    INSERT INTO "notifications"
        ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || r."idempotencyKey"),
        r."idempotencyKey", r."userId", r."notificationType"::"NotificationType",
        r."notificationTitle", r."notificationBody", r."notificationData", NOW()
    FROM recipients r
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id", "idempotencyKey", "userId", "type", "title", "body", "data"
), dispatch AS (
    INSERT INTO "notification_push_dispatches"
        ("id", "notificationId", "userId", "payload", "idempotencyKey")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || n."id"),
        n."id", n."userId",
        jsonb_build_object(
            'title', n."title", 'body', n."body",
            'url', r."pushUrl", 'tag', r."pushTag", 'type', n."type"::text
        ),
        'notification-push:' || n."id"
    FROM inserted n
    INNER JOIN recipients r ON r."idempotencyKey" = n."idempotencyKey"
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id"
)
SELECT s."id" AS "promotionId", inserted."id" AS "notificationId"
FROM started s
LEFT JOIN inserted ON inserted."idempotencyKey" = 'promotion-started-owner:' || s."id"
    OR (split_part(inserted."idempotencyKey", ':', 1) = 'store-promotion-started'
        AND split_part(inserted."idempotencyKey", ':', 2) = s."id")
ORDER BY s."id" ASC, inserted."id" ASC
`

const expiringBatchSQL = `
WITH due AS (
    SELECT p."id", p."storeId", p."productId", p."title", product."name" AS "productName"
    FROM "promotions" p
    INNER JOIN "products" product ON product."id" = p."productId"
    WHERE p."status" = 'ACTIVE'
      AND p."endsAt" > $1
      AND p."endsAt" <= $2
      AND p."expiryWarnedAt" IS NULL
    ORDER BY p."endsAt" ASC, p."id" ASC
    LIMIT $3
    FOR UPDATE OF p SKIP LOCKED
), warned AS (
    UPDATE "promotions" p
    SET "expiryWarnedAt" = $1, "updatedAt" = $1
    FROM due
    WHERE p."id" = due."id"
      AND p."status" = 'ACTIVE'
      AND p."expiryWarnedAt" IS NULL
    RETURNING p."id", p."storeId", p."productId", p."title", due."productName"
), recipients AS (
    SELECT
        w."id" AS "promotionId", w."storeId", w."productId", u."id" AS "userId",
        'PROMOTION_STATUS_CHANGE'::"NotificationType" AS "notificationType",
        'عرضك سينتهي قريباً'::text AS "notificationTitle",
        LEFT('سينتهي العرض "' || w."title" || '" على "' || w."productName" || '" خلال 24 ساعة', 500) AS "notificationBody",
        jsonb_build_object('promotionId', w."id", 'productId', w."productId", 'event', 'expiring') AS "notificationData",
        '/my-store?tab=promotions'::text AS "pushUrl",
        'promotion-' || w."id" || '-expiring' AS "pushTag",
        'promotion-expiring-owner:' || w."id" AS "idempotencyKey"
    FROM warned w
    INNER JOIN "store_details" sd ON sd."id" = w."storeId"
    INNER JOIN "seller_profiles" sp ON sp."id" = sd."sellerProfileId"
    INNER JOIN "users" u ON u."id" = sp."userId"
    WHERE u."notificationPreferences" ->> 'myPromotions' = 'true'
), inserted AS (
    INSERT INTO "notifications"
        ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || r."idempotencyKey"),
        r."idempotencyKey", r."userId", r."notificationType",
        r."notificationTitle", r."notificationBody", r."notificationData", NOW()
    FROM recipients r
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id", "idempotencyKey", "userId", "type", "title", "body", "data"
), dispatch AS (
    INSERT INTO "notification_push_dispatches"
        ("id", "notificationId", "userId", "payload", "idempotencyKey")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || n."id"),
        n."id", n."userId",
        jsonb_build_object(
            'title', n."title", 'body', n."body",
            'url', '/my-store?tab=promotions', 'tag', 'promotion-' || (n."data" ->> 'promotionId') || '-expiring',
            'type', n."type"::text
        ),
        'notification-push:' || n."id"
    FROM inserted n
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id"
)
SELECT w."id" AS "promotionId", inserted."id" AS "notificationId"
FROM warned w
LEFT JOIN inserted ON inserted."idempotencyKey" = 'promotion-expiring-owner:' || w."id"
ORDER BY w."id" ASC
`

const expiredBatchSQL = `
WITH due AS (
    SELECT p."id", p."storeId", p."productId", p."title", product."name" AS "productName"
    FROM "promotions" p
    INNER JOIN "products" product ON product."id" = p."productId"
    WHERE p."status" = 'ACTIVE'
      AND p."endsAt" <= $1
    ORDER BY p."endsAt" ASC, p."id" ASC
    LIMIT $2
    FOR UPDATE OF p SKIP LOCKED
), expired AS (
    UPDATE "promotions" p
    SET "status" = 'EXPIRED', "updatedAt" = $1
    FROM due
    WHERE p."id" = due."id"
      AND p."status" = 'ACTIVE'
      AND p."endsAt" <= $1
    RETURNING p."id", p."storeId", p."productId", p."title", due."productName"
), recipients AS (
    SELECT
        e."id" AS "promotionId", e."storeId", e."productId", u."id" AS "userId",
        'PROMOTION_STATUS_CHANGE'::"NotificationType" AS "notificationType",
        'انتهى عرضك'::text AS "notificationTitle",
        LEFT('انتهى العرض "' || e."title" || '" على "' || e."productName" || '"', 500) AS "notificationBody",
        jsonb_build_object('promotionId', e."id", 'productId', e."productId", 'event', 'expired') AS "notificationData",
        '/my-store?tab=promotions'::text AS "pushUrl",
        'promotion-' || e."id" || '-expired' AS "pushTag",
        'promotion-expired-owner:' || e."id" AS "idempotencyKey"
    FROM expired e
    INNER JOIN "store_details" sd ON sd."id" = e."storeId"
    INNER JOIN "seller_profiles" sp ON sp."id" = sd."sellerProfileId"
    INNER JOIN "users" u ON u."id" = sp."userId"
    WHERE u."notificationPreferences" ->> 'myPromotions' = 'true'
), inserted AS (
    INSERT INTO "notifications"
        ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || r."idempotencyKey"),
        r."idempotencyKey", r."userId", r."notificationType",
        r."notificationTitle", r."notificationBody", r."notificationData", NOW()
    FROM recipients r
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id", "idempotencyKey", "userId", "type", "title", "body", "data"
), dispatch AS (
    INSERT INTO "notification_push_dispatches"
        ("id", "notificationId", "userId", "payload", "idempotencyKey")
    SELECT
        'go_' || md5(random()::text || clock_timestamp()::text || n."id"),
        n."id", n."userId",
        jsonb_build_object(
            'title', n."title", 'body', n."body",
            'url', '/my-store?tab=promotions', 'tag', 'promotion-' || (n."data" ->> 'promotionId') || '-expired',
            'type', n."type"::text
        ),
        'notification-push:' || n."id"
    FROM inserted n
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id"
)
SELECT e."id" AS "promotionId", inserted."id" AS "notificationId"
FROM expired e
LEFT JOIN inserted ON inserted."idempotencyKey" = 'promotion-expired-owner:' || e."id"
ORDER BY e."id" ASC
`
