/**
 * Daily digest for low-priority / marketing-style notifications.
 *
 * For each user who has unread rows of DIGEST_TYPES, creates ONE summary
 * in-app notification and marks those rows read — so the bell is not
 * flooded by store updates / saved-search matches / admin promos.
 *
 * Critical types (NEW_MESSAGE, service quotes, fav sold, etc.) are
 * never digested.
 *
 * Usage (external cron, daily):
 *   npm run build && npm run report:notification-digest
 */
import { PrismaClient, NotificationType } from "@prisma/client";
import { logger } from "../shared/utils/logger";

const prisma = new PrismaClient();

const DIGEST_TYPES: NotificationType[] = [
  "PROMOTION",
  "SAVED_SEARCH_MATCH",
  "STORE_NEW_PRODUCT",
  "STORE_PROMOTION_STARTED",
  "STORE_PRODUCT_RESTOCKED",
];

const TYPE_LABEL_AR: Record<string, string> = {
  PROMOTION: "عروض وتخفيضات",
  SAVED_SEARCH_MATCH: "بحث محفوظ",
  STORE_NEW_PRODUCT: "منتجات متاجر",
  STORE_PROMOTION_STARTED: "عروض متاجر",
  STORE_PRODUCT_RESTOCKED: "عودة للمخزون",
};

async function main(): Promise<void> {
  const unread = await prisma.notification.findMany({
    where: {
      readAt: null,
      type: { in: DIGEST_TYPES },
    },
    select: { id: true, userId: true, type: true },
    orderBy: { createdAt: "asc" },
  });

  const byUser = new Map<
    string,
    { ids: string[]; counts: Record<string, number> }
  >();
  for (const row of unread) {
    let bucket = byUser.get(row.userId);
    if (!bucket) {
      bucket = { ids: [], counts: {} };
      byUser.set(row.userId, bucket);
    }
    bucket.ids.push(row.id);
    bucket.counts[row.type] = (bucket.counts[row.type] ?? 0) + 1;
  }

  let digests = 0;
  for (const [userId, { ids, counts }] of byUser) {
    if (ids.length < 2) continue; // single item: leave as-is

    const parts = Object.entries(counts).map(
      ([type, n]) => `${TYPE_LABEL_AR[type] ?? type}: ${n}`,
    );
    const title = "ملخص إشعاراتك";
    const body = `لديك ${ids.length} إشعاراً غير مقروء: ${parts.join(" · ")}`;

    await prisma.$transaction([
      prisma.notification.create({
        data: {
          userId,
          type: "PROMOTION",
          title,
          body,
          data: { digest: true, counts, sourceIds: ids.slice(0, 50) },
        },
      }),
      prisma.notification.updateMany({
        where: { id: { in: ids } },
        data: { readAt: new Date() },
      }),
    ]);
    digests += 1;
  }

  logger.info("dailyNotificationDigest finished", {
    usersScanned: byUser.size,
    digestsCreated: digests,
    rowsConsidered: unread.length,
  });
}

main()
  .catch((err) => {
    logger.error("dailyNotificationDigest failed", { err });
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
