// Package inventorymonitor provides seller-scoped inventory health summaries
// and a bounded, idempotent low-stock notification sweep. It never mutates
// product quantities or stock movements; stock writes remain transactional in
// the Express business services.
package inventorymonitor

import (
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"fmt"
)

const (
	LowStockThreshold int64 = 5
	CandidateLimit          = 500
	AdvisoryLockID    int64 = 731904304
)

const alertPreferenceSQL = `CASE WHEN LOWER(COALESCE(user_row."notificationPreferences" ->> 'lowStockAlerts', 'true')) = 'false' THEN FALSE ELSE TRUE END`

const alertQuery = `
		WITH candidates AS MATERIALIZED (
			SELECT product."id" AS "productId", product."name" AS "productName",
			       product."stockQuantity" AS "stockQuantity", seller."userId" AS "userId"
			FROM "products" product
		INNER JOIN "store_details" store ON store."id" = product."storeId"
		INNER JOIN "seller_profiles" seller ON seller."id" = store."sellerProfileId"
		INNER JOIN "users" user_row ON user_row."id" = seller."userId"
			WHERE product."status" = 'ACTIVE'
			  AND product."stockQuantity" <= $1
			  AND store."status" = 'ACTIVE'
			  AND seller."suspended" = FALSE
			  AND user_row."isActive" = TRUE
			  AND ` + alertPreferenceSQL + `
			  AND NOT EXISTS (
				SELECT 1 FROM "sales_automation_events" event_row
				WHERE event_row."userId" = seller."userId"
				  AND event_row."type" = 'LOW_STOCK'::"SalesAutomationEventType"
				  AND event_row."fingerprint" = product."id"
				  AND event_row."lastSentAt" > NOW() - INTERVAL '24 hours'
			  )
			ORDER BY product."stockQuantity" ASC, product."id" ASC
			LIMIT $2
		), claimed AS (
			INSERT INTO "sales_automation_events"
				("id", "userId", "type", "fingerprint", "lastSentAt", "sendCount", "createdAt", "updatedAt")
			SELECT gen_random_uuid()::text, candidate."userId",
			       'LOW_STOCK'::"SalesAutomationEventType", candidate."productId", NOW(), 1, NOW(), NOW()
			FROM candidates candidate
			ON CONFLICT ("userId", "type", "fingerprint") DO UPDATE
			SET "lastSentAt" = NOW(),
			    "sendCount" = "sales_automation_events"."sendCount" + 1,
			    "updatedAt" = NOW()
			WHERE "sales_automation_events"."lastSentAt" <= NOW() - INTERVAL '24 hours'
			RETURNING "userId", "fingerprint"
		), notifications AS (
			INSERT INTO "notifications"
				("id", "userId", "type", "title", "body", "data", "createdAt")
			SELECT gen_random_uuid()::text, candidate."userId",
			       'SALES_LOW_STOCK'::"NotificationType",
			       CASE WHEN candidate."stockQuantity" <= 0 THEN 'منتج نفد من المخزون' ELSE 'مخزون منخفض' END,
			       LEFT(candidate."productName" || ': المتبقي ' || candidate."stockQuantity"::text || ' وحدة.', 500),
			       jsonb_build_object('productId', candidate."productId", 'stockQuantity', candidate."stockQuantity"), NOW()
			FROM claimed
		INNER JOIN candidates candidate
		        ON candidate."userId" = claimed."userId"
		       AND candidate."productId" = claimed."fingerprint"
			RETURNING "id", "userId", "title", "body", "data"
		), dispatches AS (
			INSERT INTO "notification_push_dispatches"
				("id", "notificationId", "userId", "payload", "idempotencyKey", "createdAt", "availableAt")
			SELECT gen_random_uuid()::text, notification."id", notification."userId",
			       jsonb_build_object(
				  'title', notification."title",
				  'body', notification."body",
				  'url', '/my-store?tab=inventory',
				  'tag', 'sales-low-stock:' || notification."id",
				  'type', 'SALES_LOW_STOCK'
			       ),
			       'push:' || notification."id", NOW(), NOW()
			FROM notifications notification
			RETURNING "id"
		)
		SELECT
			(SELECT COUNT(*)::bigint FROM candidates),
			(SELECT COUNT(*)::bigint FROM claimed),
			(SELECT COUNT(*)::bigint FROM notifications),
			(SELECT COUNT(*)::bigint FROM dispatches),
			COALESCE((SELECT json_agg("id")::text FROM notifications), '[]')
	`

const storeSummaryQuery = `
		WITH scoped_products AS MATERIALIZED (
			SELECT p."id", p."stockQuantity", p."availability"
			FROM "products" p
			WHERE p."storeId" = $1 AND p."status" = 'ACTIVE'
		), latest_movements AS (
			SELECT DISTINCT ON (movement."productId")
			       movement."productId", movement."newQuantity"
			FROM "stock_movements" movement
		INNER JOIN scoped_products product ON product."id" = movement."productId"
		ORDER BY movement."productId", movement."createdAt" DESC, movement."id" DESC
		)
		SELECT
			COUNT(*)::bigint AS "totalProducts",
			COUNT(*) FILTER (WHERE product."stockQuantity" IS NOT NULL)::bigint AS "trackedProducts",
			COUNT(*) FILTER (WHERE product."availability" = 'IN_STOCK')::bigint AS "inStock",
			COUNT(*) FILTER (WHERE product."availability" = 'LIMITED')::bigint AS "limited",
			COUNT(*) FILTER (WHERE product."availability" = 'OUT_OF_STOCK')::bigint AS "outOfStock",
			COALESCE(SUM(product."stockQuantity"), 0)::bigint AS "totalUnits",
			COUNT(*) FILTER (WHERE product."stockQuantity" BETWEEN 1 AND $2)::bigint AS "lowStockTrackedProducts",
			COUNT(*) FILTER (WHERE product."stockQuantity" = 0)::bigint AS "zeroStockTrackedProducts",
			COUNT(*) FILTER (WHERE product."stockQuantity" < 0)::bigint AS "negativeStockProducts",
			COUNT(*) FILTER (WHERE product."stockQuantity" IS NOT NULL AND (
				(product."stockQuantity" <= 0 AND product."availability" <> 'OUT_OF_STOCK') OR
				(product."stockQuantity" BETWEEN 1 AND $2 AND product."availability" <> 'LIMITED') OR
				(product."stockQuantity" > $2 AND product."availability" <> 'IN_STOCK')
			))::bigint AS "availabilityMismatchProducts",
			COUNT(*) FILTER (WHERE product."stockQuantity" IS NOT NULL
				AND latest."productId" IS NOT NULL
				AND product."stockQuantity" IS DISTINCT FROM latest."newQuantity")::bigint AS "movementMismatchProducts"
		FROM scoped_products product
		LEFT JOIN latest_movements latest ON latest."productId" = product."id"
`

type StoreSummary struct {
	TotalProducts                int64 `json:"totalProducts"`
	TrackedProducts              int64 `json:"trackedProducts"`
	UntrackedProducts            int64 `json:"untrackedProducts"`
	InStock                      int64 `json:"inStock"`
	Limited                      int64 `json:"limited"`
	OutOfStock                   int64 `json:"outOfStock"`
	TotalUnits                   int64 `json:"totalUnits"`
	LowStockTrackedProducts      int64 `json:"lowStockTrackedProducts"`
	ZeroStockTrackedProducts     int64 `json:"zeroStockTrackedProducts"`
	NegativeStockProducts        int64 `json:"negativeStockProducts"`
	AvailabilityMismatchProducts int64 `json:"availabilityMismatchProducts"`
	MovementMismatchProducts     int64 `json:"movementMismatchProducts"`
}

type RunResult struct {
	LockAcquired          bool     `json:"lockAcquired"`
	CandidatesScanned     int64    `json:"candidatesScanned"`
	EventsClaimed         int64    `json:"eventsClaimed"`
	NotificationsCreated  int64    `json:"notificationsCreated"`
	PushDispatchesCreated int64    `json:"pushDispatchesCreated"`
	NotificationIDs       []string `json:"notificationIds"`
}

func GetStoreSummary(ctx context.Context, db *sql.DB, storeID string) (StoreSummary, error) {
	if db == nil {
		return StoreSummary{}, errors.New("inventory monitor database is required")
	}
	if ctx == nil {
		return StoreSummary{}, errors.New("inventory monitor context is required")
	}
	if storeID == "" || len(storeID) > 128 {
		return StoreSummary{}, errors.New("valid store ID is required")
	}

	const query = storeSummaryQuery

	var summary StoreSummary
	err := db.QueryRowContext(ctx, query, storeID, LowStockThreshold).Scan(
		&summary.TotalProducts,
		&summary.TrackedProducts,
		&summary.InStock,
		&summary.Limited,
		&summary.OutOfStock,
		&summary.TotalUnits,
		&summary.LowStockTrackedProducts,
		&summary.ZeroStockTrackedProducts,
		&summary.NegativeStockProducts,
		&summary.AvailabilityMismatchProducts,
		&summary.MovementMismatchProducts,
	)
	if err != nil {
		return StoreSummary{}, fmt.Errorf("query store inventory summary: %w", err)
	}
	summary.UntrackedProducts = summary.TotalProducts - summary.TrackedProducts
	return summary, nil
}

// RunLowStockAlerts claims at most CandidateLimit seller/product alerts in one
// transaction. The same SalesAutomationEvent fingerprint and 24-hour cooldown
// are used by the existing manual Sales Automation route, so both paths share
// one idempotency boundary. Product quantities are never changed here.
func RunLowStockAlerts(ctx context.Context, db *sql.DB) (RunResult, error) {
	if db == nil {
		return RunResult{}, errors.New("inventory monitor database is required")
	}
	if ctx == nil {
		return RunResult{}, errors.New("inventory monitor context is required")
	}

	tx, err := db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelReadCommitted})
	if err != nil {
		return RunResult{}, fmt.Errorf("begin inventory monitor transaction: %w", err)
	}
	defer func() { _ = tx.Rollback() }()

	var locked bool
	if err := tx.QueryRowContext(ctx, `SELECT pg_try_advisory_xact_lock($1)`, AdvisoryLockID).Scan(&locked); err != nil {
		return RunResult{}, fmt.Errorf("acquire inventory monitor lock: %w", err)
	}
	if !locked {
		return RunResult{LockAcquired: false}, nil
	}
	if _, err := tx.ExecContext(ctx, `SET LOCAL statement_timeout = '15s'`); err != nil {
		return RunResult{}, fmt.Errorf("set inventory monitor statement timeout: %w", err)
	}

	query := alertQuery
	result := RunResult{LockAcquired: true, NotificationIDs: []string{}}
	var notificationIDsJSON string
	if err := tx.QueryRowContext(ctx, query, LowStockThreshold, CandidateLimit).Scan(
		&result.CandidatesScanned,
		&result.EventsClaimed,
		&result.NotificationsCreated,
		&result.PushDispatchesCreated,
		&notificationIDsJSON,
	); err != nil {
		return RunResult{}, fmt.Errorf("create low-stock alerts: %w", err)
	}
	if result.EventsClaimed != result.NotificationsCreated || result.NotificationsCreated != result.PushDispatchesCreated {
		return RunResult{}, fmt.Errorf("inventory alert transaction is inconsistent: claimed=%d notifications=%d dispatches=%d", result.EventsClaimed, result.NotificationsCreated, result.PushDispatchesCreated)
	}
	if err := json.Unmarshal([]byte(notificationIDsJSON), &result.NotificationIDs); err != nil {
		return RunResult{}, fmt.Errorf("decode inventory notification IDs: %w", err)
	}
	if int64(len(result.NotificationIDs)) != result.NotificationsCreated {
		return RunResult{}, fmt.Errorf("inventory alert notification IDs mismatch: ids=%d notifications=%d", len(result.NotificationIDs), result.NotificationsCreated)
	}
	if err := tx.Commit(); err != nil {
		return RunResult{}, fmt.Errorf("commit inventory monitor transaction: %w", err)
	}
	return result, nil
}
