import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';

type WeeklyKind = 'ads' | 'stores' | 'services';
type SalesJob = 'daily-reminder' | 'debt-reminder' | 'overdue-installments' | 'weekly-report';

type WeeklyDelta = {
  userId: string;
  totalDelta: bigint;
  itemCount: bigint;
  entityIds: string[];
  viewSnapshots: bigint[];
  entityId: string | null;
};

const WEEKLY_CONFIG = {
  ads: {
    type: 'WEEKLY_AD_VIEWS_REPORT',
    title: 'تقرير مشاهدات إعلاناتك الأسبوعي',
    singular: 'حصل إعلانك على مشاهدة جديدة هذا الأسبوع',
    plural: (n: number) => `حصلت إعلاناتك على ${n} مشاهدة جديدة هذا الأسبوع`,
    url: '/dashboard', tag: 'weekly-ad-views-report',
  },
  stores: {
    type: 'WEEKLY_STORE_VIEWS_REPORT',
    title: 'تقرير مشاهدات متجرك الأسبوعي',
    singular: 'حصل متجرك على مشاهدة جديدة هذا الأسبوع',
    plural: (n: number) => `حصل متجرك على ${n} مشاهدة جديدة هذا الأسبوع`,
    url: '/my-store?tab=analytics', tag: 'weekly-store-views-report',
  },
  services: {
    type: 'WEEKLY_SERVICE_VIEWS_REPORT',
    title: 'تقرير مشاهدات خدماتك الأسبوعي',
    singular: 'حصلت خدماتك على مشاهدة جديدة هذا الأسبوع',
    plural: (n: number) => `حصلت خدماتك على ${n} مشاهدة جديدة هذا الأسبوع`,
    url: '/my-services?tab=analytics', tag: 'weekly-service-views-report',
  },
} as const;

const WEEKLY_QUERIES: Record<WeeklyKind, string> = {
  ads: `SELECT a."userId" AS "userId", SUM(a."views" - a."viewsAtLastReport")::bigint AS "totalDelta",
      COUNT(*)::bigint AS "itemCount", ARRAY_AGG(a."id" ORDER BY a."id") AS "entityIds",
      ARRAY_AGG(a."views"::bigint ORDER BY a."id") AS "viewSnapshots", NULL::text AS "entityId"
    FROM "ads" a INNER JOIN "users" u ON u."id" = a."userId"
    WHERE a."status" = 'ACTIVE' AND a."views" > a."viewsAtLastReport"
      AND COALESCE((u."notificationPreferences" ->> 'adViews')::boolean, FALSE) = TRUE
    GROUP BY a."userId" HAVING SUM(a."views" - a."viewsAtLastReport") > 0`,
  stores: `SELECT sp."userId" AS "userId", (s."views" - s."viewsAtLastReport")::bigint AS "totalDelta",
      1::bigint AS "itemCount", ARRAY[s."id"] AS "entityIds", ARRAY[s."views"::bigint] AS "viewSnapshots", s."id" AS "entityId"
    FROM "store_details" s INNER JOIN "seller_profiles" sp ON sp."id" = s."sellerProfileId"
    INNER JOIN "users" u ON u."id" = sp."userId"
    WHERE s."status" = 'ACTIVE' AND s."views" > s."viewsAtLastReport"
      AND COALESCE((u."notificationPreferences" ->> 'adViews')::boolean, FALSE) = TRUE`,
  services: `SELECT u."id" AS "userId", SUM(sl."views" - sl."viewsAtLastReport")::bigint AS "totalDelta",
      COUNT(*)::bigint AS "itemCount", ARRAY_AGG(sl."id" ORDER BY sl."id") AS "entityIds",
      ARRAY_AGG(sl."views"::bigint ORDER BY sl."id") AS "viewSnapshots", spd."id" AS "entityId"
    FROM "service_listings" sl INNER JOIN "service_provider_details" spd ON spd."id" = sl."providerId"
    INNER JOIN "seller_profiles" sp ON sp."id" = spd."sellerProfileId"
    INNER JOIN "users" u ON u."id" = sp."userId"
    WHERE sl."status" = 'ACTIVE' AND sl."views" > sl."viewsAtLastReport"
      AND COALESCE((u."notificationPreferences" ->> 'adViews')::boolean, FALSE) = TRUE
    GROUP BY u."id", spd."id" HAVING SUM(sl."views" - sl."viewsAtLastReport") > 0`,
};

async function createNotificationAndDispatch(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    type: string;
    title: string;
    body: string;
    idempotencyKey: string;
    data?: Record<string, unknown>;
    url?: string;
    tag?: string;
  }
): Promise<boolean> {
  const id = randomUUID();
  const inserted = await tx.$queryRaw<Array<{ id: string }>>`
    INSERT INTO "notifications" ("id", "idempotencyKey", "userId", "type", "title", "body", "data", "createdAt")
    VALUES (${id}, ${input.idempotencyKey}, ${input.userId}, ${input.type}, ${input.title}, ${input.body},
      ${input.data ? JSON.stringify(input.data) : null}::jsonb, NOW())
    ON CONFLICT ("idempotencyKey") DO NOTHING
    RETURNING "id"
  `;
  if (inserted.length === 0) return false;
  const payload = {
    title: input.title,
    body: input.body,
    url: input.url ?? '/account/sales',
    tag: input.tag ?? input.type,
    type: input.type,
  };
  await tx.$executeRaw`
    INSERT INTO "notification_push_dispatches" ("id", "notificationId", "userId", "payload", "idempotencyKey")
    VALUES (${randomUUID()}, ${id}, ${input.userId}, ${JSON.stringify(payload)}::jsonb, ${`push:${id}`})
    ON CONFLICT ("idempotencyKey") DO NOTHING
  `;
  return true;
}

export async function runWeeklyViewsExpressFallback(
  tx: Prisma.TransactionClient,
  kind: WeeklyKind,
  now = new Date()
): Promise<{ notificationsCreated: number; baselinesAdvanced: number }> {
  const rows = await tx.$queryRawUnsafe<WeeklyDelta[]>(WEEKLY_QUERIES[kind]);
  const config = WEEKLY_CONFIG[kind];
  const runKey = now.toISOString().slice(0, 10);
  let notificationsCreated = 0;
  let baselinesAdvanced = 0;

  for (const row of rows) {
    const totalDelta = Number(row.totalDelta);
    if (totalDelta <= 0 || row.entityIds.length !== row.viewSnapshots.length) continue;
    const body = totalDelta === 1 ? config.singular : config.plural(totalDelta);
    const data = kind === 'ads'
      ? { totalDelta, adCount: Number(row.itemCount) }
      : kind === 'stores'
        ? { totalDelta, storeId: row.entityId }
        : { totalDelta, providerId: row.entityId };
    const created = await createNotificationAndDispatch(tx, {
      userId: row.userId,
      type: config.type,
      title: config.title,
      body,
      data,
      idempotencyKey: `marketplat:weekly-${kind}-views:${runKey}:${row.userId}`,
      url: config.url,
      tag: config.tag,
    });
    if (!created) continue;

    let updated = 0;
    if (kind === 'ads') {
      updated = await tx.$executeRaw`
        UPDATE "ads" AS target SET "viewsAtLastReport" = source.snapshot
        FROM unnest(${row.entityIds}::text[], ${row.viewSnapshots}::bigint[]) AS source(id, snapshot)
        WHERE target."id" = source.id AND target."viewsAtLastReport" < source.snapshot
      `;
    } else if (kind === 'stores') {
      updated = await tx.$executeRaw`
        UPDATE "store_details" AS target SET "viewsAtLastReport" = source.snapshot
        FROM unnest(${row.entityIds}::text[], ${row.viewSnapshots}::bigint[]) AS source(id, snapshot)
        WHERE target."id" = source.id AND target."viewsAtLastReport" < source.snapshot
      `;
    } else {
      updated = await tx.$executeRaw`
        UPDATE "service_listings" AS target SET "viewsAtLastReport" = source.snapshot
        FROM unnest(${row.entityIds}::text[], ${row.viewSnapshots}::bigint[]) AS source(id, snapshot)
        WHERE target."id" = source.id AND target."viewsAtLastReport" < source.snapshot
      `;
    }
    notificationsCreated += 1;
    baselinesAdvanced += updated;
  }
  return { notificationsCreated, baselinesAdvanced };
}

export async function runSellerResponseMetricsExpressFallback(
  tx: Prisma.TransactionClient,
  now = new Date(),
  windowDays = 90
): Promise<{ updated: number }> {
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1_000);
  const rows = await tx.$queryRaw<Array<{ userId: string }>>`
    WITH first_buyer_msg AS (
      SELECT DISTINCT ON (m."conversationId") m."conversationId", c."sellerId", m."createdAt" AS "buyerMsgAt"
      FROM "messages" m INNER JOIN "conversations" c ON c."id" = m."conversationId"
      WHERE m."senderId" = c."buyerId" AND m."createdAt" >= ${windowStart}
      ORDER BY m."conversationId", m."createdAt" ASC
    ), first_seller_reply AS (
      SELECT DISTINCT ON (fbm."conversationId") fbm."conversationId", fbm."sellerId", fbm."buyerMsgAt",
        m."createdAt" AS "sellerReplyAt"
      FROM first_buyer_msg fbm INNER JOIN "messages" m ON m."conversationId" = fbm."conversationId"
        AND m."senderId" = fbm."sellerId" AND m."createdAt" > fbm."buyerMsgAt"
      ORDER BY fbm."conversationId", m."createdAt" ASC
    ), aggregated AS (
      SELECT fbm."sellerId", COUNT(DISTINCT fbm."conversationId")::bigint AS "totalInitiated",
        COUNT(DISTINCT fsr."conversationId")::bigint AS "totalReplied",
        AVG(EXTRACT(EPOCH FROM (fsr."sellerReplyAt" - fbm."buyerMsgAt")) / 60)::float8 AS "avgResponseMinutes"
      FROM first_buyer_msg fbm LEFT JOIN first_seller_reply fsr ON fsr."conversationId" = fbm."conversationId"
      GROUP BY fbm."sellerId"
    )
    UPDATE "seller_profiles" AS profile
    SET "responseRate" = (aggregated."totalReplied"::numeric / NULLIF(aggregated."totalInitiated", 0)) * 100,
      "responseTimeMinutes" = CASE WHEN aggregated."totalReplied" > 0 AND aggregated."avgResponseMinutes" IS NOT NULL
        THEN ROUND(aggregated."avgResponseMinutes")::int ELSE NULL END,
      "updatedAt" = NOW()
    FROM aggregated WHERE profile."userId" = aggregated."sellerId"
    RETURNING profile."userId"
  `;
  return { updated: rows.length };
}

export async function runSalesNotificationExpressFallback(
  tx: Prisma.TransactionClient,
  job: SalesJob,
  now = new Date()
): Promise<{ notificationsCreated: number }> {
  const dayStart = new Date(now);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(dayStart.getTime() + 24 * 60 * 60 * 1_000);
  const weekStart = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);
  const rows: Array<Record<string, unknown>> = [];

  if (job === 'daily-reminder') {
    rows.push(...await tx.$queryRaw<Array<Record<string, unknown>>>`
      SELECT u."id" AS "userId", 'لم تسجّل مبيعات اليوم'::text AS "title",
        'لم تسجّل مبيعة اليوم. هل تريد تسجيل عملية بيع الآن؟'::text AS "body",
        ('marketplat:sales-daily:' || ${dayStart.toISOString().slice(0, 10)} || ':' || u."id") AS "idempotencyKey"
      FROM "users" u WHERE u."isActive" = TRUE
        AND EXISTS (SELECT 1 FROM "seller_profiles" sp WHERE sp."userId" = u."id")
        AND COALESCE((u."notificationPreferences" ->> 'salesAlerts')::boolean, TRUE) = TRUE
        AND NOT EXISTS (SELECT 1 FROM "sale_records" sr WHERE sr."sellerId" = u."id"
          AND sr."soldAt" >= ${dayStart} AND sr."soldAt" < ${dayEnd})
        AND NOT EXISTS (SELECT 1 FROM "notifications" n WHERE n."userId" = u."id"
          AND n."type" = 'SALES_DAILY_REMINDER' AND n."title" = 'لم تسجّل مبيعات اليوم' AND n."createdAt" >= ${dayStart})
    `);
  } else if (job === 'debt-reminder') {
    rows.push(...await tx.$queryRaw<Array<Record<string, unknown>>>`
      WITH limited AS (
        SELECT sr."id", sr."sellerId", sr."buyerName", sr."dueAmount", sr."customerId", sr."dueDate"
        FROM "sale_records" sr WHERE sr."dueAmount" > 0 AND sr."dueDate" < ${new Date(now.getTime() - 30 * 86400000)}
        ORDER BY sr."dueDate" ASC, sr."id" ASC LIMIT 2000
      ), chosen AS (
        SELECT DISTINCT ON (l."sellerId") l.* FROM limited l
        INNER JOIN "users" u ON u."id" = l."sellerId"
        WHERE COALESCE((u."notificationPreferences" ->> 'debtAlerts')::boolean, TRUE) = TRUE
          AND NOT EXISTS (SELECT 1 FROM "notifications" n WHERE n."userId" = l."sellerId"
            AND n."type" = 'SALES_DEBT_REMINDER' AND n."title" = 'دين متأخر' AND n."createdAt" >= ${weekStart})
        ORDER BY l."sellerId", l."dueDate" ASC, l."id" ASC
      )
      SELECT "sellerId" AS "userId", 'دين متأخر'::text AS "title",
        ('على ' || "buyerName" || ' دين مستمر بقيمة ' || to_char("dueAmount", 'FM999999999990.00') || ' ₪ منذ أكثر من 30 يومًا.') AS "body",
        CASE WHEN "customerId" IS NULL THEN NULL ELSE jsonb_build_object('customerId', "customerId") END AS "data",
        ('marketplat:sales-debt:' || ${weekStart.toISOString().slice(0, 10)} || ':' || "sellerId") AS "idempotencyKey"
      FROM chosen
    `);
  } else if (job === 'overdue-installments') {
    rows.push(...await tx.$queryRaw<Array<Record<string, unknown>>>`
      WITH limited AS (
        SELECT si."id" AS "installmentId", si."saleId", si."installmentNo", si."dueDate",
          sr."sellerId", sr."buyerName", sr."invoiceNumber"
        FROM "sale_installments" si INNER JOIN "sale_records" sr ON sr."id" = si."saleId"
        WHERE si."status" IN ('PENDING', 'PARTIAL') AND si."dueDate" < ${now}
        ORDER BY si."dueDate" ASC, si."id" ASC LIMIT 1000
      ), chosen AS (
        SELECT DISTINCT ON (l."sellerId") l.* FROM limited l
        INNER JOIN "users" u ON u."id" = l."sellerId"
        WHERE COALESCE((u."notificationPreferences" ->> 'installmentAlerts')::boolean, TRUE) = TRUE
          AND NOT EXISTS (SELECT 1 FROM "notifications" n WHERE n."userId" = l."sellerId"
            AND n."type" = 'SALES_OVERDUE_INSTALLMENT' AND n."title" = 'قسط متأخر' AND n."createdAt" >= ${dayStart})
        ORDER BY l."sellerId", l."dueDate" ASC, l."installmentId" ASC
      )
      SELECT "sellerId" AS "userId", 'قسط متأخر'::text AS "title",
        ('القسط رقم ' || "installmentNo" || ' للعميل ' || "buyerName" || ' متأخر'
          || CASE WHEN "invoiceNumber" IS NULL OR "invoiceNumber" = '' THEN '' ELSE ' · ' || "invoiceNumber" END || '.') AS "body",
        jsonb_build_object('installmentId', "installmentId", 'saleId', "saleId") AS "data",
        ('marketplat:sales-overdue-installment:' || ${dayStart.toISOString().slice(0, 10)} || ':' || "sellerId") AS "idempotencyKey"
      FROM chosen
    `);
  } else {
    rows.push(...await tx.$queryRaw<Array<Record<string, unknown>>>`
      WITH totals AS (
        SELECT sr."sellerId", COUNT(*)::bigint AS sale_count,
          COALESCE(SUM(sr."totalPrice" - sr."refundedAmount"), 0)::numeric AS revenue
        FROM "sale_records" sr WHERE sr."soldAt" >= ${weekStart} AND sr."soldAt" < ${now}
        GROUP BY sr."sellerId"
      )
      SELECT t."sellerId" AS "userId", 'تقرير مبيعاتك الأسبوعي'::text AS "title",
        ('سجلت ' || t.sale_count || ' مبيعة بإيرادات صافية ' || to_char(t.revenue, 'FM999999999990.00') || ' ₪ خلال آخر 7 أيام.') AS "body",
        NULL::jsonb AS "data",
        ('marketplat:weekly-sales:' || ${dayStart.toISOString().slice(0, 10)} || ':' || t."sellerId") AS "idempotencyKey"
      FROM totals t INNER JOIN "users" u ON u."id" = t."sellerId"
      WHERE COALESCE((u."notificationPreferences" ->> 'weeklySalesReport')::boolean, TRUE) = TRUE
        AND NOT EXISTS (SELECT 1 FROM "notifications" n WHERE n."userId" = t."sellerId"
          AND n."type" = 'SALES_WEEKLY_REPORT' AND n."title" = 'تقرير مبيعاتك الأسبوعي' AND n."createdAt" >= ${dayStart})
    `);
  }

  let notificationsCreated = 0;
  for (const row of rows) {
    const created = await createNotificationAndDispatch(tx, {
      userId: String(row.userId),
      type: job === 'daily-reminder' ? 'SALES_DAILY_REMINDER'
        : job === 'debt-reminder' ? 'SALES_DEBT_REMINDER'
          : job === 'overdue-installments' ? 'SALES_OVERDUE_INSTALLMENT' : 'SALES_WEEKLY_REPORT',
      title: String(row.title),
      body: String(row.body),
      data: row.data && typeof row.data === 'object' ? row.data as Record<string, unknown> : undefined,
      idempotencyKey: String(row.idempotencyKey),
      url: '/account/sales',
    });
    if (created) notificationsCreated += 1;
  }
  return { notificationsCreated };
}
