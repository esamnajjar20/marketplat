import { Prisma } from '@prisma/client';

export const invoicesService = {
  /**
   * Reserves the next global/year invoice number. The transaction-scoped
   * PostgreSQL advisory lock closes the first-row upsert race as well as the
   * normal increment race without relying on retrying an aborted transaction.
   */
  nextInvoiceNumber: async (tx: Prisma.TransactionClient, _sellerId: string): Promise<string> => {
    const year = new Date().getFullYear();
    await tx.$executeRaw(Prisma.sql`SELECT pg_advisory_xact_lock(hashtextextended(${String(year)}, 0))`);
    const counter = await tx.invoiceCounter.upsert({
      where: { year },
      create: { year, nextValue: 2 },
      update: { nextValue: { increment: 1 } },
    });
    return `INV-${year}-${String(counter.nextValue - 1).padStart(4, '0')}`;
  },
};
