// Package notificationdigest consolidates unread, low-priority notifications
// into one Arabic digest per user. All grouping and source-row updates happen in
// PostgreSQL so large unread backlogs are not loaded into the Go process.
package notificationdigest

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const (
	DefaultBatchSize = 100
	MaxBatchSize     = 500
)

// Result contains aggregate operational metadata only.
type Result struct {
	DigestsCreated int64 `json:"digestsCreated"`
	RowsMarkedRead int64 `json:"rowsMarkedRead"`
	Batches        int   `json:"batches"`
}

type queryer interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
}

// Run processes users in keyset-paginated batches. Each SQL statement is an
// atomic unit: it creates the digest and marks exactly its source notification
// rows read in the same statement. The caller must hold this job's advisory
// lock on the same pinned database connection for the duration of the run.
func Run(ctx context.Context, db queryer, batchSize int, now time.Time) (Result, error) {
	if batchSize < 1 || batchSize > MaxBatchSize {
		return Result{}, fmt.Errorf("batchSize must be between 1 and %d", MaxBatchSize)
	}

	now = now.UTC()
	result := Result{}
	lastUserID := ""

	for {
		rows, err := db.QueryContext(ctx, digestBatchSQL, lastUserID, batchSize, now)
		if err != nil {
			return result, fmt.Errorf("process notification digest batch: %w", err)
		}

		if !rows.Next() {
			rowsErr := rows.Err()
			_ = rows.Close()
			if rowsErr != nil {
				return result, fmt.Errorf("read notification digest batch result: %w", rowsErr)
			}
			return result, fmt.Errorf("notification digest batch returned no status row")
		}

		var nextUserID sql.NullString
		var digestsCreated int64
		var rowsMarkedRead int64
		if err := rows.Scan(&nextUserID, &digestsCreated, &rowsMarkedRead); err != nil {
			_ = rows.Close()
			return result, fmt.Errorf("scan notification digest batch result: %w", err)
		}
		rowsErr := rows.Err()
		closeErr := rows.Close()
		if rowsErr != nil {
			return result, fmt.Errorf("iterate notification digest batch result: %w", rowsErr)
		}
		if closeErr != nil {
			return result, fmt.Errorf("close notification digest batch result: %w", closeErr)
		}

		result.DigestsCreated += digestsCreated
		result.RowsMarkedRead += rowsMarkedRead
		if !nextUserID.Valid || nextUserID.String == "" {
			break
		}
		if nextUserID.String == lastUserID {
			return result, fmt.Errorf("notification digest cursor did not advance")
		}

		lastUserID = nextUserID.String
		result.Batches++
	}

	return result, nil
}

// Keep this SQL aligned with the Express fallback in
// apps/api/src/scripts/dailyNotificationDigest.ts.
const digestBatchSQL = `
WITH candidate_users AS MATERIALIZED (
    SELECT n."userId"
    FROM "notifications" AS n
    WHERE n."readAt" IS NULL
      AND n."type" IN (
          'PROMOTION',
          'SAVED_SEARCH_MATCH',
          'STORE_NEW_PRODUCT',
          'STORE_PROMOTION_STARTED',
          'STORE_PRODUCT_RESTOCKED'
      )
      AND n."data"->'digest' IS DISTINCT FROM 'true'::jsonb
      AND ($1 = '' OR n."userId" > $1)
    GROUP BY n."userId"
    HAVING COUNT(*) >= 2
    ORDER BY n."userId" ASC
    LIMIT $2
),
eligible AS MATERIALIZED (
    SELECT
        n."id",
        n."userId",
        n."type"::text AS "type",
        n."createdAt",
        ROW_NUMBER() OVER (
            PARTITION BY n."userId"
            ORDER BY n."createdAt" ASC, n."id" ASC
        ) AS source_rank
    FROM "notifications" AS n
    INNER JOIN candidate_users AS cu ON cu."userId" = n."userId"
    WHERE n."readAt" IS NULL
      AND n."type" IN (
          'PROMOTION',
          'SAVED_SEARCH_MATCH',
          'STORE_NEW_PRODUCT',
          'STORE_PROMOTION_STARTED',
          'STORE_PRODUCT_RESTOCKED'
      )
      AND n."data"->'digest' IS DISTINCT FROM 'true'::jsonb
),
stats AS (
    SELECT
        e."userId",
        COUNT(*)::bigint AS total,
        COUNT(*) FILTER (WHERE e."type" = 'PROMOTION')::bigint AS promotion_count,
        COUNT(*) FILTER (WHERE e."type" = 'SAVED_SEARCH_MATCH')::bigint AS saved_search_count,
        COUNT(*) FILTER (WHERE e."type" = 'STORE_NEW_PRODUCT')::bigint AS store_product_count,
        COUNT(*) FILTER (WHERE e."type" = 'STORE_PROMOTION_STARTED')::bigint AS store_promotion_count,
        COUNT(*) FILTER (WHERE e."type" = 'STORE_PRODUCT_RESTOCKED')::bigint AS store_restock_count,
        MIN(e."createdAt") FILTER (WHERE e."type" = 'PROMOTION') AS promotion_first,
        MIN(e."createdAt") FILTER (WHERE e."type" = 'SAVED_SEARCH_MATCH') AS saved_search_first,
        MIN(e."createdAt") FILTER (WHERE e."type" = 'STORE_NEW_PRODUCT') AS store_product_first,
        MIN(e."createdAt") FILTER (WHERE e."type" = 'STORE_PROMOTION_STARTED') AS store_promotion_first,
        MIN(e."createdAt") FILTER (WHERE e."type" = 'STORE_PRODUCT_RESTOCKED') AS store_restock_first,
        ARRAY_AGG(e."id" ORDER BY e."createdAt" ASC, e."id" ASC)
            FILTER (WHERE e.source_rank <= 50) AS source_ids
    FROM eligible AS e
    GROUP BY e."userId"
    HAVING COUNT(*) >= 2
),
selected AS (
    SELECT *
    FROM stats
),
parts AS (
    SELECT
        s."userId",
        STRING_AGG(v.label || ': ' || v.amount::text, ' · ' ORDER BY v.first_at ASC, v.type ASC) AS body_parts
    FROM selected AS s
    CROSS JOIN LATERAL (VALUES
        ('PROMOTION'::text, s.promotion_count, s.promotion_first, 'عروض وتخفيضات'::text),
        ('SAVED_SEARCH_MATCH'::text, s.saved_search_count, s.saved_search_first, 'بحث محفوظ'::text),
        ('STORE_NEW_PRODUCT'::text, s.store_product_count, s.store_product_first, 'منتجات متاجر'::text),
        ('STORE_PROMOTION_STARTED'::text, s.store_promotion_count, s.store_promotion_first, 'عروض متاجر'::text),
        ('STORE_PRODUCT_RESTOCKED'::text, s.store_restock_count, s.store_restock_first, 'عودة للمخزون'::text)
    ) AS v(type, amount, first_at, label)
    WHERE v.amount > 0
    GROUP BY s."userId"
),
created AS (
    INSERT INTO "notifications" (
        "id", "userId", "type", "title", "body", "data", "createdAt"
    )
    SELECT
        gen_random_uuid()::text,
        s."userId",
        'PROMOTION',
        'ملخص إشعاراتك',
        'لديك ' || s.total::text || ' إشعاراً غير مقروء: ' || p.body_parts,
        jsonb_build_object(
            'digest', TRUE,
            'counts', jsonb_strip_nulls(jsonb_build_object(
                'PROMOTION', NULLIF(s.promotion_count, 0),
                'SAVED_SEARCH_MATCH', NULLIF(s.saved_search_count, 0),
                'STORE_NEW_PRODUCT', NULLIF(s.store_product_count, 0),
                'STORE_PROMOTION_STARTED', NULLIF(s.store_promotion_count, 0),
                'STORE_PRODUCT_RESTOCKED', NULLIF(s.store_restock_count, 0)
            )),
            'sourceIds', to_jsonb(s.source_ids)
        ),
        $3
    FROM selected AS s
    INNER JOIN parts AS p ON p."userId" = s."userId"
    RETURNING "userId"
),
updated AS (
    UPDATE "notifications" AS n
    SET "readAt" = $3
    FROM eligible AS e
    INNER JOIN created AS c ON c."userId" = e."userId"
    WHERE n."id" = e."id"
    RETURNING n."id"
)
SELECT
    (SELECT MAX("userId") FROM selected) AS "lastUserId",
    (SELECT COUNT(*) FROM created)::bigint AS "digestsCreated",
    (SELECT COUNT(*) FROM updated)::bigint AS "rowsMarkedRead"
`
