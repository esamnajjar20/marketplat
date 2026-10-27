import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';
import { ListSalesQuery } from './sales.validation';

const saleInclude = {
  customer: true,
  items: { orderBy: { createdAt: 'asc' as const } },
  payments: { orderBy: { paidAt: 'asc' as const } },
  returns: { orderBy: { createdAt: 'asc' as const } },
  installments: { orderBy: { installmentNo: 'asc' as const } },
  store: { select: { id: true, name: true, slug: true, logoUrl: true } },
};

export const salesRepository = {
  findById: (id: string) => prisma.saleRecord.findUnique({ where: { id }, include: saleInclude }),
  findByIdTx: (tx: Prisma.TransactionClient, id: string) =>
    tx.saleRecord.findUnique({ where: { id }, include: saleInclude }),

  findForSeller: async (sellerId: string, query: ListSalesQuery) => {
    const { page, limit, skip, take } = getPaginationParams(query);
    const where: Prisma.SaleRecordWhereInput = {
      sellerId,
      ...(query.status ? { paymentStatus: query.status } : {}),
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.customerId ? { customerId: query.customerId } : {}),
      ...(query.storeId ? { storeId: query.storeId } : {}),
      ...(query.from || query.to
        ? {
            soldAt: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.saleRecord.findMany({
        where,
        include: saleInclude,
        orderBy: [{ soldAt: 'desc' }, { id: 'desc' }],
        skip,
        take,
      }),
      prisma.saleRecord.count({ where }),
    ]);
    return {
      items,
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page < Math.ceil(total / limit),
        hasPrevPage: page > 1,
      },
    };
  },

  create: (tx: Prisma.TransactionClient, data: Prisma.SaleRecordCreateInput) =>
    tx.saleRecord.create({ data, include: saleInclude }),
  update: (id: string, data: Prisma.SaleRecordUpdateInput) =>
    prisma.saleRecord.update({ where: { id }, data, include: saleInclude }),
  delete: (tx: Prisma.TransactionClient, id: string) => tx.saleRecord.delete({ where: { id } }),

  addPayment: (tx: Prisma.TransactionClient, data: Prisma.SalePaymentCreateInput) =>
    tx.salePayment.create({ data }),
  addReturn: (tx: Prisma.TransactionClient, data: Prisma.SaleReturnCreateInput) =>
    tx.saleReturn.create({ data }),

  summary: async (sellerId: string, from: Date, to: Date) => {
    const where: Prisma.SaleRecordWhereInput = { sellerId, soldAt: { gte: from, lt: to } };
    // Let PostgreSQL aggregate the sale-level totals instead of loading every sale row.
    // Item-level cost remains a narrow projection because returned quantities affect cost.
    const [sales, items] = await Promise.all([
      prisma.saleRecord.aggregate({
        where,
        _count: { _all: true },
        _sum: {
          totalPrice: true,
          refundedAmount: true,
          paidAmount: true,
          dueAmount: true,
          quantity: true,
        },
      }),
      prisma.saleItem.findMany({
        where: { sale: { sellerId, soldAt: { gte: from, lt: to } } },
        select: { quantity: true, returnedQuantity: true, costPrice: true },
      }),
    ]);
    const totalRevenue =
      Number(sales._sum.totalPrice ?? 0) - Number(sales._sum.refundedAmount ?? 0);
    const totalCost = items.reduce(
      (sum, item) =>
        sum +
        (item.costPrice === null
          ? 0
          : Number(item.costPrice) * Math.max(item.quantity - item.returnedQuantity, 0)),
      0
    );
    const totalRefunded = Number(sales._sum.refundedAmount ?? 0);
    return {
      salesCount: sales._count._all,
      quantity: sales._sum.quantity ?? 0,
      totalRevenue: Math.round(totalRevenue * 100) / 100,
      totalCost: Math.round(totalCost * 100) / 100,
      netProfit: Math.round((totalRevenue - totalCost) * 100) / 100,
      totalPaid: Math.round(Number(sales._sum.paidAmount ?? 0) * 100) / 100,
      totalRefunded: Math.round(totalRefunded * 100) / 100,
      totalDue: Math.round(Number(sales._sum.dueAmount ?? 0) * 100) / 100,
    };
  },

  chart: async (
    sellerId: string,
    from: Date,
    to: Date,
    period: 'day' | 'week' | 'month' | 'year' = 'day'
  ) => {
    // `period` is a closed union, and the selected SQL unit comes only from this whitelist.
    // Aggregate by UTC bucket in PostgreSQL so wide date ranges do not transfer every sale row.
    const unit =
      period === 'year'
        ? 'year'
        : period === 'month'
          ? 'month'
          : period === 'week'
            ? 'week'
            : 'day';
    return prisma.$queryRaw<
      Array<{
        date: Date;
        revenue: Prisma.Decimal;
        paid: Prisma.Decimal;
        due: Prisma.Decimal;
        count: bigint;
      }>
    >`
      SELECT
        date_trunc(${unit}, "soldAt" AT TIME ZONE 'UTC') AS date,
        COALESCE(SUM("totalPrice" - "refundedAmount"), 0) AS revenue,
        COALESCE(SUM("paidAmount"), 0) AS paid,
        COALESCE(SUM("dueAmount"), 0) AS due,
        COUNT(*) AS count
      FROM "sale_records"
      WHERE "sellerId" = ${sellerId}
        AND "soldAt" >= ${from}
        AND "soldAt" < ${to}
      GROUP BY date
      ORDER BY date ASC
    `;
  },

  topProducts: async (sellerId: string, limit: number) => {
    // Aggregate historical line items in PostgreSQL instead of transferring every item to Node.
    // Product-backed rows group by productId; deleted/unlinked products group by their sale-time title.
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number.isFinite(limit) ? limit : 10)));
    const rows = await prisma.$queryRaw<
      Array<{
        productId: string | null;
        title: string;
        quantity: bigint;
        revenue: Prisma.Decimal;
        profit: Prisma.Decimal;
      }>
    >`
      SELECT
        si."productId" AS "productId",
        CASE WHEN si."productId" IS NOT NULL THEN MAX(si."title") ELSE si."title" END AS "title",
        SUM(GREATEST(si."quantity" - si."returnedQuantity", 0))::bigint AS "quantity",
        SUM(
          CASE WHEN si."quantity" > 0
            THEN si."lineTotal" * GREATEST(si."quantity" - si."returnedQuantity", 0)::numeric / si."quantity"
            ELSE 0
          END
        ) AS "revenue",
        SUM(
          CASE WHEN si."quantity" > 0
            THEN si."lineTotal" * GREATEST(si."quantity" - si."returnedQuantity", 0)::numeric / si."quantity"
            ELSE 0
          END
          - COALESCE(si."costPrice", 0) * GREATEST(si."quantity" - si."returnedQuantity", 0)
        ) AS "profit"
      FROM "sale_items" si
      INNER JOIN "sale_records" sr ON sr."id" = si."saleId"
      WHERE sr."sellerId" = ${sellerId}
        AND si."entityType" = 'PRODUCT'
      GROUP BY
        si."productId",
        CASE WHEN si."productId" IS NULL THEN si."title" ELSE NULL END
      ORDER BY "revenue" DESC
      LIMIT ${safeLimit}
    `;
    return rows.map(row => ({
      productId: row.productId,
      title: row.title,
      quantity: Number(row.quantity),
      revenue: Math.round(Number(row.revenue) * 100) / 100,
      profit: Math.round(Number(row.profit) * 100) / 100,
    }));
  },

  topCustomers: async (sellerId: string, limit: number) => {
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(Number.isFinite(limit) ? limit : 5)));
    const rows = await prisma.$queryRaw<Array<{
      customerId: string;
      buyerName: string;
      totalSpent: Prisma.Decimal;
      saleCount: bigint;
    }>>`
      SELECT
        sr."customerId" AS "customerId",
        COALESCE(MAX(c."name"), MAX(sr."buyerName")) AS "buyerName",
        COALESCE(SUM(sr."totalPrice" - sr."refundedAmount"), 0) AS "totalSpent",
        COUNT(*)::bigint AS "saleCount"
      FROM "sale_records" sr
      LEFT JOIN "sales_customers" c
        ON c."id" = sr."customerId" AND c."sellerId" = sr."sellerId"
      WHERE sr."sellerId" = ${sellerId}
        AND sr."customerId" IS NOT NULL
      GROUP BY sr."customerId"
      ORDER BY "totalSpent" DESC, sr."customerId" ASC
      LIMIT ${safeLimit}
    `;
    return rows.map(row => ({
      customerId: row.customerId,
      buyerName: row.buyerName,
      _sum: { totalPrice: row.totalSpent },
      _count: { id: Number(row.saleCount) },
    }));
  },

  debts: async (sellerId: string, page = 1, limit = 20) => {
    const safePage = Math.min(1000, Math.max(1, Math.trunc(page)));
    const safeLimit = Math.min(100, Math.max(1, Math.trunc(limit)));
    const where: Prisma.SaleRecordWhereInput = {
      sellerId,
      dueAmount: { gt: 0 },
      paymentStatus: { in: ['PARTIAL', 'UNPAID', 'OVERDUE'] },
    };
    const [rows, totalCount] = await Promise.all([
      prisma.saleRecord.findMany({
        where,
        include: { customer: true },
        orderBy: [{ dueDate: 'asc' }, { soldAt: 'asc' }, { id: 'asc' }],
        skip: (safePage - 1) * safeLimit,
        take: safeLimit,
      }),
      prisma.saleRecord.count({ where }),
    ]);
    return {
      rows,
      totalCount,
      page: safePage,
      limit: safeLimit,
      totalPages: Math.ceil(totalCount / safeLimit),
      hasNextPage: safePage * safeLimit < totalCount,
      hasPrevPage: safePage > 1,
    };
  },
};
