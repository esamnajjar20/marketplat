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
      ...(input.type !== undefined ? { type: input.type } : {}),
      ...(input.required !== undefined ? { required: input.required } : {}),
      ...(input.options !== undefined ? { options: input.options === null ? Prisma.JsonNull : input.options as Prisma.InputJsonValue } : {}),
      ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
    },
  }),
};
