import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { CreateStoreTypeFieldInput, UpdateStoreTypeFieldInput } from './store-type-fields.validation';

export const storeTypeFieldsRepository = {
  findActive: (storeTypeId: string) => prisma.storeTypeField.findMany({
    where: { storeTypeId, isActive: true },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  }),
  findAll: (storeTypeId: string) => prisma.storeTypeField.findMany({
    where: { storeTypeId },
    orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
  }),
  findById: (id: string) => prisma.storeTypeField.findUnique({ where: { id } }),
  create: (storeTypeId: string, input: CreateStoreTypeFieldInput) => prisma.storeTypeField.create({
    data: {
      storeTypeId,
      key: input.key,
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
