import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

export const customersRepository = {
  findById: (id: string) =>
    prisma.customer.findUnique({
      where: { id },
      include: { sales: { orderBy: { soldAt: 'desc' }, take: 100 } },
    }),
  findBySellerAndId: (sellerId: string, id: string) =>
    prisma.customer.findFirst({
      where: { id, sellerId },
      include: { sales: { orderBy: { soldAt: 'desc' }, take: 100 } },
    }),
  findByPhone: (sellerId: string, phone: string) =>
    prisma.customer.findFirst({ where: { sellerId, phone } }),
  create: (data: Prisma.CustomerCreateInput) => prisma.customer.create({ data }),
  update: (id: string, data: Prisma.CustomerUpdateInput) =>
    prisma.customer.update({ where: { id }, data }),
  list: async (
    sellerId: string,
    opts: { page?: number; limit?: number; q?: string; dueOnly?: boolean }
  ) => {
    const { page, limit, skip, take } = getPaginationParams(opts);
    const where: Prisma.CustomerWhereInput = {
      sellerId,
      ...(opts.dueOnly ? { totalDue: { gt: 0 } } : {}),
      ...(opts.q
        ? {
            OR: [
              { name: { contains: opts.q, mode: 'insensitive' } },
              { phone: { contains: opts.q } },
            ],
          }
        : {}),
    };
    const [items, total] = await prisma.$transaction([
      prisma.customer.findMany({
        where,
        orderBy: [{ lastPurchaseAt: 'desc' }, { name: 'asc' }],
        skip,
        take,
      }),
      prisma.customer.count({ where }),
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
  summary: async (sellerId: string) => {
    // All summary metrics scan the same seller's customer rows. Compute them in
    // one round-trip instead of issuing four COUNTs and one aggregate in parallel.
    const inactiveBefore = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000);
    const rows = await prisma.$queryRaw<
      Array<{
        totalCustomers: bigint;
        vipCustomers: bigint;
        debtors: bigint;
        inactiveCustomers: bigint;
        totalSpent: unknown;
        averageCustomerSpend: unknown;
      }>
    >`
      SELECT
        COUNT(*) AS "totalCustomers",
        COUNT(*) FILTER (WHERE "isVip" = TRUE) AS "vipCustomers",
        COUNT(*) FILTER (WHERE "totalDue" > 0) AS "debtors",
        COUNT(*) FILTER (
          WHERE "lastPurchaseAt" IS NULL OR "lastPurchaseAt" < ${inactiveBefore}
        ) AS "inactiveCustomers",
        COALESCE(SUM("totalSpent"), 0) AS "totalSpent",
        COALESCE(AVG("totalSpent"), 0) AS "averageCustomerSpend"
      FROM "sales_customers"
      WHERE "sellerId" = ${sellerId}
    `;
    const row = rows[0];
    return {
      totalCustomers: Number(row?.totalCustomers ?? 0n),
      vipCustomers: Number(row?.vipCustomers ?? 0n),
      debtors: Number(row?.debtors ?? 0n),
      inactiveCustomers: Number(row?.inactiveCustomers ?? 0n),
      totalSpent: Number(row?.totalSpent ?? 0),
      averageCustomerSpend: Number(row?.averageCustomerSpend ?? 0),
    };
  },
  search: (sellerId: string, q: string) =>
    prisma.customer.findMany({
      where: {
        sellerId,
        OR: [{ name: { contains: q, mode: 'insensitive' } }, { phone: { contains: q } }],
      },
      orderBy: [{ lastPurchaseAt: 'desc' }, { name: 'asc' }],
      take: 10,
    }),
};
