import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { CreateStoreTypeFieldInput, UpdateStoreTypeFieldInput } from './store-type-fields.validation';

export const storeTypeFieldsRepository = {
  findActive: (storeTypeId: string, scope?: 'STORE' | 'PRODUCT') => prisma.storeTypeField.findMany({
    where: { storeTypeId, isActive: true, ...(scope ? { scope } : {}) },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  }),
  findAll: (storeTypeId: string) => prisma.storeTypeField.findMany({
    where: { storeTypeId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  }),
  findById: (id: string) => prisma.storeTypeField.findUnique({ where: { id } }),

  countStoresByType: (storeTypeId: string) =>
    prisma.storeDetails.count({ where: { storeTypeId } }),

  countProductsByType: (storeTypeId: string) =>
    prisma.product.count({ where: { store: { storeTypeId } } }),

  countRecordsWithAttribute: async (storeTypeId: string, scope: 'STORE' | 'PRODUCT', key: string): Promise<number> => {
    if (scope === 'STORE') {
      const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "store_details"
        WHERE "store_type_id" = ${storeTypeId}
          AND "attributes" IS NOT NULL
          AND "attributes" ? ${key}
      `);
      return Number(rows[0]?.count ?? 0);
    }

    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "products" p
      INNER JOIN "store_details" s ON s."id" = p."store_id"
      WHERE s."store_type_id" = ${storeTypeId}
        AND p."attributes" IS NOT NULL
        AND p."attributes" ? ${key}
    `);
    return Number(rows[0]?.count ?? 0);
  },

  countRecordsMissingRequiredAttribute: async (storeTypeId: string, scope: 'STORE' | 'PRODUCT', key: string): Promise<number> => {
    if (scope === 'STORE') {
      const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
        SELECT COUNT(*)::bigint AS count
        FROM "store_details"
        WHERE "store_type_id" = ${storeTypeId}
          AND ("attributes" IS NULL OR NOT ("attributes" ? ${key}) OR "attributes"->>${key} = '')
      `);
      return Number(rows[0]?.count ?? 0);
    }

    const rows = await prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
      SELECT COUNT(*)::bigint AS count
      FROM "products" p
      INNER JOIN "store_details" s ON s."id" = p."store_id"
      WHERE s."store_type_id" = ${storeTypeId}
        AND (p."attributes" IS NULL OR NOT (p."attributes" ? ${key}) OR p."attributes"->>${key} = '')
    `);
    return Number(rows[0]?.count ?? 0);
  },
  create: (storeTypeId: string, input: CreateStoreTypeFieldInput) => prisma.storeTypeField.create({
    data: {
      storeTypeId,
      key: input.key,
      scope: input.scope ?? 'STORE',
      labelAr: input.labelAr,
      cardLabelAr: input.cardLabelAr ?? null,
      pageLabelAr: input.pageLabelAr ?? null,
      showOnCard: input.showOnCard ?? false,
      showOnPage: input.showOnPage ?? true,
      type: input.type,
      required: input.required ?? false,
      options: input.options ? (input.options as Prisma.InputJsonValue) : undefined,
      sortOrder: input.sortOrder ?? 0,
    },
  }),
  update: (id: string, input: UpdateStoreTypeFieldInput) => prisma.storeTypeField.update({
    where: { id },
    data: {
      // FIX FIELD-SCOPE-IMMUTABLE-REPO: scope is never updated (see
      // store-type-fields.service.update — it rejects any attempt).
      ...(input.labelAr !== undefined ? { labelAr: input.labelAr } : {}),
      ...(input.cardLabelAr !== undefined ? { cardLabelAr: input.cardLabelAr } : {}),
      ...(input.pageLabelAr !== undefined ? { pageLabelAr: input.pageLabelAr } : {}),
      ...(input.showOnCard !== undefined ? { showOnCard: input.showOnCard } : {}),
      ...(input.showOnPage !== undefined ? { showOnPage: input.showOnPage } : {}),
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.required !== undefined ? { required: input.required } : {}),
      ...(input.options !== undefined ? { options: input.options === null ? Prisma.JsonNull : input.options as Prisma.InputJsonValue } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  }),
};
