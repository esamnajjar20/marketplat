package salesjobs

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

const (
	DailyReminder       = "daily-reminder"
	DebtReminder        = "debt-reminder"
	OverdueInstallments = "overdue-installments"
	WeeklyReport        = "weekly-report"
)

type Result struct {
	Job                   string `json:"job"`
	NotificationsCreated  int64  `json:"notificationsCreated"`
	PushDispatchesCreated int64  `json:"pushDispatchesCreated"`
	EvaluatedAt           string `json:"evaluatedAt"`
}

const dailyReminderSQL = `
WITH candidates AS (
  SELECT u."id" AS "userId",
    'marketplat:sales-daily:' || to_char(date_trunc('day', $1::timestamptz), 'YYYY-MM-DD') || ':' || u."id" AS "idempotencyKey",
    'لم تسجّل مبيعات اليوم'::text AS title,
    'لم تسجّل مبيعة اليوم. هل تريد تسجيل عملية بيع الآن؟'::text AS body
  FROM "users" u
  WHERE u."isActive" = TRUE
    AND EXISTS (SELECT 1 FROM "seller_profiles" sp WHERE sp."userId" = u."id")
    AND COALESCE((u."notificationPreferences" ->> 'salesAlerts')::boolean, TRUE) = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM "sale_records" sr
      WHERE sr."sellerId" = u."id" AND sr."soldAt" >= date_trunc('day', $1::timestamptz)
        AND sr."soldAt" < date_trunc('day', $1::timestamptz) + INTERVAL '1 day'
    )
    AND NOT EXISTS (
      SELECT 1 FROM "notifications" n WHERE n."userId" = u."id"
        AND n."type" = 'SALES_DAILY_REMINDER' AND n."title" = 'لم تسجّل مبيعات اليوم'
        AND n."createdAt" >= date_trunc('day', $1::timestamptz)
    )
), inserted AS (
  INSERT INTO "notifications" ("id", "idempotencyKey", "userId", "type", "title", "body", "createdAt")
  SELECT 'go_' || md5(random()::text || clock_timestamp()::text || c."userId"),
    c."idempotencyKey", c."userId", 'SALES_DAILY_REMINDER', c.title, c.body, NOW()
  FROM candidates c
  ON CONFLICT ("idempotencyKey") DO NOTHING
  RETURNING "id", "userId", "title", "body", "type"
), dispatch AS (
  INSERT INTO "notification_push_dispatches" ("id", "notificationId", "userId", "payload", "idempotencyKey")
  SELECT 'go_' || md5(random()::text || clock_timestamp()::text || i."id"), i."id", i."userId",
    jsonb_build_object('title', i."title", 'body', i."body", 'url', '/account/sales', 'tag', i."type", 'type', i."type"),
    'push:' || i."id"
  FROM inserted i
  ON CONFLICT ("idempotencyKey") DO NOTHING
  RETURNING "id"
)
SELECT (SELECT COUNT(*) FROM inserted)::bigint, (SELECT COUNT(*) FROM dispatch)::bigint
`

const debtReminderSQL = `
WITH limited AS (
  SELECT sr."id", sr."sellerId", sr."buyerName", sr."dueAmount", sr."customerId", sr."dueDate"
  FROM "sale_records" sr
  WHERE sr."dueAmount" > 0 AND sr."dueDate" < ($1::timestamptz - INTERVAL '30 days')
  ORDER BY sr."dueDate" ASC, sr."id" ASC
  LIMIT 2000
), candidates AS (
  SELECT DISTINCT ON (l."sellerId") l."sellerId" AS "userId", l."buyerName", l."dueAmount", l."customerId",
    'marketplat:sales-debt:' || to_char(($1::timestamptz - INTERVAL '7 days'), 'YYYY-MM-DD') || ':' || l."sellerId" AS "idempotencyKey"
  FROM limited l
  INNER JOIN "users" u ON u."id" = l."sellerId"
  WHERE COALESCE((u."notificationPreferences" ->> 'debtAlerts')::boolean, TRUE) = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM "notifications" n WHERE n."userId" = l."sellerId"
        AND n."type" = 'SALES_DEBT_REMINDER' AND n."title" = 'دين متأخر'
        AND n."createdAt" >= ($1::timestamptz - INTERVAL '7 days')
    )
  ORDER BY l."sellerId", l."dueDate" ASC, l."id" ASC
), prepared AS (
  SELECT c.*,
    ('على ' || c."buyerName" || ' دين مستمر بقيمة ' || to_char(c."dueAmount", 'FM999999999990.00') || ' ₪ منذ أكثر من 30 يومًا.') AS body
  FROM candidates c
), inserted AS (
  INSERT INTO "notifications" ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
  SELECT 'go_' || md5(random()::text || clock_timestamp()::text || p."userId"), p."idempotencyKey",
    p."userId", 'SALES_DEBT_REMINDER', 'دين متأخر', p.body,
    CASE WHEN p."customerId" IS NULL THEN NULL ELSE jsonb_build_object('customerId', p."customerId") END, NOW()
  FROM prepared p
  ON CONFLICT ("idempotencyKey") DO NOTHING
  RETURNING "id", "userId", "title", "body", "type"
), dispatch AS (
  INSERT INTO "notification_push_dispatches" ("id", "notificationId", "userId", "payload", "idempotencyKey")
  SELECT 'go_' || md5(random()::text || clock_timestamp()::text || i."id"), i."id", i."userId",
    jsonb_build_object('title', i."title", 'body', i."body", 'url', '/account/sales', 'tag', i."type", 'type', i."type"),
    'push:' || i."id"
  FROM inserted i
  ON CONFLICT ("idempotencyKey") DO NOTHING
  RETURNING "id"
)
SELECT (SELECT COUNT(*) FROM inserted)::bigint, (SELECT COUNT(*) FROM dispatch)::bigint
`

const overdueInstallmentsSQL = `
WITH limited AS (
  SELECT si."id" AS "installmentId", si."saleId", si."installmentNo", si."dueDate",
    sr."sellerId", sr."buyerName", sr."invoiceNumber"
  FROM "sale_installments" si
  INNER JOIN "sale_records" sr ON sr."id" = si."saleId"
  WHERE si."status" IN ('PENDING', 'PARTIAL') AND si."dueDate" < $1::timestamptz
  ORDER BY si."dueDate" ASC, si."id" ASC
  LIMIT 1000
), candidates AS (
  SELECT DISTINCT ON (l."sellerId") l.*,
    'marketplat:sales-overdue-installment:' || to_char(date_trunc('day', $1::timestamptz), 'YYYY-MM-DD') || ':' || l."sellerId" AS "idempotencyKey"
  FROM limited l
  INNER JOIN "users" u ON u."id" = l."sellerId"
  WHERE COALESCE((u."notificationPreferences" ->> 'installmentAlerts')::boolean, TRUE) = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM "notifications" n WHERE n."userId" = l."sellerId"
        AND n."type" = 'SALES_OVERDUE_INSTALLMENT' AND n."title" = 'قسط متأخر'
        AND n."createdAt" >= date_trunc('day', $1::timestamptz)
    )
  ORDER BY l."sellerId", l."dueDate" ASC, l."installmentId" ASC
), prepared AS (
  SELECT c.*,
    ('القسط رقم ' || c."installmentNo" || ' للعميل ' || c."buyerName" || ' متأخر'
      || CASE WHEN c."invoiceNumber" IS NULL OR c."invoiceNumber" = '' THEN '' ELSE ' · ' || c."invoiceNumber" END || '.') AS body
  FROM candidates c
), inserted AS (
  INSERT INTO "notifications" ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
  SELECT 'go_' || md5(random()::text || clock_timestamp()::text || p."sellerId"), p."idempotencyKey",
    p."sellerId", 'SALES_OVERDUE_INSTALLMENT', 'قسط متأخر', p.body,
    jsonb_build_object('installmentId', p."installmentId", 'saleId', p."saleId"), NOW()
  FROM prepared p
  ON CONFLICT ("idempotencyKey") DO NOTHING
  RETURNING "id", "userId", "title", "body", "type"
), dispatch AS (
  INSERT INTO "notification_push_dispatches" ("id", "notificationId", "userId", "payload", "idempotencyKey")
  SELECT 'go_' || md5(random()::text || clock_timestamp()::text || i."id"), i."id", i."userId",
    jsonb_build_object('title', i."title", 'body', i."body", 'url', '/account/sales', 'tag', i."type", 'type', i."type"),
    'push:' || i."id"
  FROM inserted i
  ON CONFLICT ("idempotencyKey") DO NOTHING
  RETURNING "id"
)
SELECT (SELECT COUNT(*) FROM inserted)::bigint, (SELECT COUNT(*) FROM dispatch)::bigint
`

const weeklySalesSQL = `
WITH totals AS (
  SELECT sr."sellerId", COUNT(*)::bigint AS sale_count,
    COALESCE(SUM(sr."totalPrice" - sr."refundedAmount"), 0)::numeric AS revenue
  FROM "sale_records" sr
  WHERE sr."soldAt" >= ($1::timestamptz - INTERVAL '7 days') AND sr."soldAt" < $1::timestamptz
  GROUP BY sr."sellerId"
), candidates AS (
  SELECT t.*, u."id" AS "userId",
    'marketplat:weekly-sales:' || to_char(date_trunc('day', $1::timestamptz), 'YYYY-MM-DD') || ':' || t."sellerId" AS "idempotencyKey"
  FROM totals t
  INNER JOIN "users" u ON u."id" = t."sellerId"
  WHERE COALESCE((u."notificationPreferences" ->> 'weeklySalesReport')::boolean, TRUE) = TRUE
    AND NOT EXISTS (
      SELECT 1 FROM "notifications" n WHERE n."userId" = t."sellerId"
        AND n."type" = 'SALES_WEEKLY_REPORT' AND n."title" = 'تقرير مبيعاتك الأسبوعي'
        AND n."createdAt" >= date_trunc('day', $1::timestamptz)
    )
), prepared AS (
  SELECT c.*, ('سجلت ' || c.sale_count || ' مبيعة بإيرادات صافية '
    || to_char(c.revenue, 'FM999999999990.00') || ' ₪ خلال آخر 7 أيام.') AS body
  FROM candidates c
), inserted AS (
  INSERT INTO "notifications" ("id", "idempotencyKey", "userId", "type", "title", "body", "createdAt")
  SELECT 'go_' || md5(random()::text || clock_timestamp()::text || p."userId"), p."idempotencyKey",
    p."userId", 'SALES_WEEKLY_REPORT', 'تقرير مبيعاتك الأسبوعي', p.body, NOW()
  FROM prepared p
  ON CONFLICT ("idempotencyKey") DO NOTHING
  RETURNING "id", "userId", "title", "body", "type"
), dispatch AS (
  INSERT INTO "notification_push_dispatches" ("id", "notificationId", "userId", "payload", "idempotencyKey")
  SELECT 'go_' || md5(random()::text || clock_timestamp()::text || i."id"), i."id", i."userId",
    jsonb_build_object('title', i."title", 'body', i."body", 'url', '/account/sales', 'tag', i."type", 'type', i."type"),
    'push:' || i."id"
  FROM inserted i
  ON CONFLICT ("idempotencyKey") DO NOTHING
  RETURNING "id"
)
SELECT (SELECT COUNT(*) FROM inserted)::bigint, (SELECT COUNT(*) FROM dispatch)::bigint
`

func Run(ctx context.Context, conn *sql.Conn, job string, now time.Time) (Result, error) {
	var statement string
	switch job {
	case DailyReminder:
		statement = dailyReminderSQL
	case DebtReminder:
		statement = debtReminderSQL
	case OverdueInstallments:
		statement = overdueInstallmentsSQL
	case WeeklyReport:
		statement = weeklySalesSQL
	default:
		return Result{}, fmt.Errorf("unsupported sales notification job %q", job)
	}
	tx, err := conn.BeginTx(ctx, nil)
	if err != nil {
		return Result{}, fmt.Errorf("begin %s: %w", job, err)
	}
	defer tx.Rollback()
	var notifications, dispatches int64
	if err := tx.QueryRowContext(ctx, statement, now.UTC()).Scan(&notifications, &dispatches); err != nil {
		return Result{}, fmt.Errorf("execute %s: %w", job, err)
	}
	if err := tx.Commit(); err != nil {
		return Result{}, fmt.Errorf("commit %s: %w", job, err)
	}
	return Result{Job: job, NotificationsCreated: notifications, PushDispatchesCreated: dispatches, EvaluatedAt: now.UTC().Format(time.RFC3339)}, nil
}

func SQLForTest(job string) string {
	switch job {
	case DailyReminder:
		return dailyReminderSQL
	case DebtReminder:
		return debtReminderSQL
	case OverdueInstallments:
		return overdueInstallmentsSQL
	case WeeklyReport:
		return weeklySalesSQL
	default:
		return ""
	}
}
