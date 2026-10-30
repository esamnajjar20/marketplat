package sellerresponse

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const DefaultWindowDays = 90

type Result struct {
	Updated     int64     `json:"updated"`
	WindowDays  int       `json:"windowDays"`
	WindowStart time.Time `json:"windowStart"`
}

const updateSQL = `
WITH first_buyer_msg AS (
  SELECT DISTINCT ON (m."conversationId")
    m."conversationId", c."sellerId", m."createdAt" AS "buyerMsgAt"
  FROM "messages" m
  INNER JOIN "conversations" c ON c."id" = m."conversationId"
  WHERE m."senderId" = c."buyerId" AND m."createdAt" >= $1
  ORDER BY m."conversationId", m."createdAt" ASC
),
first_seller_reply AS (
  SELECT DISTINCT ON (fbm."conversationId")
    fbm."conversationId", fbm."sellerId", fbm."buyerMsgAt",
    m."createdAt" AS "sellerReplyAt"
  FROM first_buyer_msg fbm
  INNER JOIN "messages" m
    ON m."conversationId" = fbm."conversationId"
   AND m."senderId" = fbm."sellerId"
   AND m."createdAt" > fbm."buyerMsgAt"
  ORDER BY fbm."conversationId", m."createdAt" ASC
),
aggregated AS (
  SELECT fbm."sellerId",
    COUNT(DISTINCT fbm."conversationId")::bigint AS "totalInitiated",
    COUNT(DISTINCT fsr."conversationId")::bigint AS "totalReplied",
    AVG(EXTRACT(EPOCH FROM (fsr."sellerReplyAt" - fbm."buyerMsgAt")) / 60)::float8 AS "avgResponseMinutes"
  FROM first_buyer_msg fbm
  LEFT JOIN first_seller_reply fsr ON fsr."conversationId" = fbm."conversationId"
  GROUP BY fbm."sellerId"
)
UPDATE "seller_profiles" AS profile
SET "responseRate" = (aggregated."totalReplied"::numeric / NULLIF(aggregated."totalInitiated", 0)) * 100,
    "responseTimeMinutes" = CASE
      WHEN aggregated."totalReplied" > 0 AND aggregated."avgResponseMinutes" IS NOT NULL
      THEN ROUND(aggregated."avgResponseMinutes")::int
      ELSE NULL
    END,
    "updatedAt" = NOW()
FROM aggregated
WHERE profile."userId" = aggregated."sellerId"
RETURNING profile."userId"
`

func Run(ctx context.Context, conn *sql.Conn, now time.Time, windowDays int) (Result, error) {
	if windowDays < 1 || windowDays > 3650 {
		return Result{}, fmt.Errorf("windowDays must be between 1 and 3650")
	}
	windowStart := now.Add(-time.Duration(windowDays) * 24 * time.Hour)
	rows, err := conn.QueryContext(ctx, updateSQL, windowStart)
	if err != nil {
		return Result{}, fmt.Errorf("update seller response metrics: %w", err)
	}
	var updated int64
	for rows.Next() {
		var userID string
		if err := rows.Scan(&userID); err != nil {
			rows.Close()
			return Result{}, err
		}
		updated++
	}
	if err := rows.Err(); err != nil {
		rows.Close()
		return Result{}, err
	}
	if err := rows.Close(); err != nil {
		return Result{}, err
	}
	return Result{Updated: updated, WindowDays: windowDays, WindowStart: windowStart.UTC()}, nil
}

func UpdateSQLForTest() string { return updateSQL }
