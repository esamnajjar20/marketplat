import { randomUUID } from 'node:crypto';
import { prisma } from '../../config/prisma';
import { notificationsService } from '../notifications/notifications.service';
import { publishDurableNotifications } from '../../shared/go-worker/publishDurableNotifications';
import { Prisma, NotificationType, SalesAutomationEventType } from '@prisma/client';

const DAY = 24 * 60 * 60 * 1000;
const roundMoney = (n: number) => Math.round(n * 100) / 100;

type Alert = {
  type: SalesAutomationEventType;
  notificationType: NotificationType;
  fingerprint: string;
  title: string;
  body: string;
  data: Prisma.InputJsonValue;
  cooldownMs: number;
};

async function notifyOnce(userId: string, alert: Alert): Promise<boolean> {
  const cutoff = new Date(Date.now() - alert.cooldownMs);
  const result = await prisma.$transaction(async tx => {
    // Claim the logical alert atomically. The same unique key/cooldown is used
    // by Go's scheduled inventory monitor, so manual and scheduled sweeps can
    // safely race without duplicate notifications or unique-constraint errors.
    const claimed = await tx.$queryRaw<Array<{ id: string }>>`
      INSERT INTO "sales_automation_events"
        ("id", "userId", "type", "fingerprint", "lastSentAt", "sendCount", "createdAt", "updatedAt")
      VALUES (
        ${randomUUID()}, ${userId}, ${alert.type}::"SalesAutomationEventType",
        ${alert.fingerprint}, NOW(), 1, NOW(), NOW()
      )
      ON CONFLICT ("userId", "type", "fingerprint") DO UPDATE
      SET "lastSentAt" = NOW(),
          "sendCount" = "sales_automation_events"."sendCount" + 1,
          "updatedAt" = NOW()
      WHERE "sales_automation_events"."lastSentAt" <= ${cutoff}
      RETURNING "id"
    `;
    if (claimed.length === 0) return { sent: false, notificationId: null as string | null };
    const notification = await tx.notification.create({
      data: {
        userId,
        type: alert.notificationType,
        title: alert.title,
        body: alert.body.slice(0, 500),
        data: alert.data,
      },
      select: { id: true },
    });
    if (alert.type === 'LOW_STOCK') {
      const payload = {
        title: alert.title,
        body: alert.body.slice(0, 500),
        url: '/my-store?tab=inventory',
        tag: `sales-low-stock:${notification.id}`,
        type: alert.notificationType,
      };
      await tx.notificationPushDispatch.create({
        data: {
          notificationId: notification.id,
          userId,
          payload,
          idempotencyKey: `push:${notification.id}`,
        },
      });
    }
    return { sent: true, notificationId: notification.id };
  });
  if (result.notificationId) {
    await publishDurableNotifications(prisma, [result.notificationId], 'sales-automation');
  }
  return result.sent;
}

export const salesAutomationService = {
  run: async (userId: string) => {
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * DAY);
    const inactiveBefore = new Date(now.getTime() - 60 * DAY);
    const lowStockAlertsAllowed = await notificationsService.userAllowsPreference(userId, 'lowStockAlerts');
    const [lowStock, overdueSales, upcomingInstallments, inactiveCustomers, monthSummary] =
      await Promise.all([
        lowStockAlertsAllowed
          ? prisma.product.findMany({
              where: {
                status: 'ACTIVE',
                stockQuantity: { lte: 5 },
                store: {
                  status: 'ACTIVE',
                  sellerProfile: { userId, suspended: false, user: { isActive: true } },
                },
              },
              select: { id: true, name: true, stockQuantity: true },
              orderBy: { stockQuantity: 'asc' },
              take: 25,
            })
          : Promise.resolve([] as Array<{ id: string; name: string; stockQuantity: number | null }>),
        prisma.saleRecord.findMany({
          where: {
            sellerId: userId,
            dueAmount: { gt: 0 },
            dueDate: { lt: now },
            paymentStatus: { in: ['PARTIAL', 'UNPAID', 'OVERDUE'] },
          },
          select: {
            id: true,
            invoiceNumber: true,
            buyerName: true,
            dueAmount: true,
            dueDate: true,
          },
          take: 100,
        }),
        prisma.saleInstallment.findMany({
          where: {
            sale: { sellerId: userId },
            status: { in: ['PENDING', 'PARTIAL'] },
            dueDate: { gte: now, lte: soon },
          },
          select: {
            id: true,
            amount: true,
            dueDate: true,
            installmentNo: true,
            sale: { select: { invoiceNumber: true, buyerName: true } },
          },
          orderBy: { dueDate: 'asc' },
          take: 100,
        }),
        prisma.customer.findMany({
          where: {
            sellerId: userId,
            purchaseCount: { gt: 0 },
            OR: [{ lastPurchaseAt: null }, { lastPurchaseAt: { lt: inactiveBefore } }],
            isBlacklisted: false,
          },
          select: { id: true, name: true, lastPurchaseAt: true, totalSpent: true },
          orderBy: { lastPurchaseAt: 'asc' },
          take: 50,
        }),
        prisma.saleRecord.aggregate({
          where: { sellerId: userId, soldAt: { gte: new Date(now.getTime() - 30 * DAY) } },
          _sum: { totalPrice: true, refundedAmount: true },
          _count: { id: true },
        }),
      ]);

    let sent = 0;
    for (const product of lowStock) {
      const didSend = await notifyOnce(userId, {
        type: 'LOW_STOCK',
        notificationType: 'SALES_LOW_STOCK',
        fingerprint: product.id,
        title: (product.stockQuantity ?? 0) <= 0 ? 'منتج نفد من المخزون' : 'مخزون منخفض',
        body: `${product.name}: المتبقي ${product.stockQuantity ?? 0} وحدة.`,
        data: { productId: product.id, stockQuantity: product.stockQuantity },
        cooldownMs: DAY,
      });
      if (didSend) sent++;
    }
    for (const sale of overdueSales) {
      const didSend = await notifyOnce(userId, {
        type: 'OVERDUE_DEBT',
        notificationType: 'SALES_OVERDUE_DEBT',
        fingerprint: sale.id,
        title: 'دين متأخر',
        body: `${sale.buyerName} لديه مبلغ مستحق ${roundMoney(Number(sale.dueAmount))} ₪.`,
        data: {
          saleId: sale.id,
          invoiceNumber: sale.invoiceNumber,
          dueAmount: Number(sale.dueAmount),
        },
        cooldownMs: DAY,
      });
      if (didSend) sent++;
    }
    for (const installment of upcomingInstallments) {
      const didSend = await notifyOnce(userId, {
        type: 'UPCOMING_INSTALLMENT',
        notificationType: 'SALES_UPCOMING_INSTALLMENT',
        fingerprint: installment.id,
        title: 'قسط قريب الاستحقاق',
        body: `قسط ${installment.installmentNo} للعميل ${installment.sale.buyerName}: ${roundMoney(Number(installment.amount))} ₪.`,
        data: {
          installmentId: installment.id,
          dueDate: installment.dueDate,
          invoiceNumber: installment.sale.invoiceNumber,
        },
        cooldownMs: DAY,
      });
      if (didSend) sent++;
    }
    for (const customer of inactiveCustomers) {
      const didSend = await notifyOnce(userId, {
        type: 'INACTIVE_CUSTOMER',
        notificationType: 'SALES_INACTIVE_CUSTOMER',
        fingerprint: customer.id,
        title: 'عميل غير نشط',
        body: `${customer.name} لم يشترِ منذ أكثر من 60 يومًا.`,
        data: { customerId: customer.id, lastPurchaseAt: customer.lastPurchaseAt },
        cooldownMs: 7 * DAY,
      });
      if (didSend) sent++;
    }

    const dailyKey = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      .toISOString()
      .slice(0, 10);
    const dailySent = await notifyOnce(userId, {
      type: 'DAILY_SUMMARY',
      notificationType: 'SALES_DAILY_SUMMARY',
      fingerprint: dailyKey,
      title: 'ملخص المبيعات',
      body: `آخر 30 يومًا: ${monthSummary._count.id} عملية و${roundMoney(Number(monthSummary._sum.totalPrice ?? 0) - Number(monthSummary._sum.refundedAmount ?? 0))} ₪ إيراد.`,
      data: {
        days: 30,
        count: monthSummary._count.id,
        revenue:
          Number(monthSummary._sum.totalPrice ?? 0) - Number(monthSummary._sum.refundedAmount ?? 0),
      },
      cooldownMs: DAY,
    });
    if (dailySent) sent++;

    return {
      scanned: {
        lowStock: lowStock.length,
        overdueDebts: overdueSales.length,
        upcomingInstallments: upcomingInstallments.length,
        inactiveCustomers: inactiveCustomers.length,
      },
      notificationsSent: sent,
    };
  },
};
