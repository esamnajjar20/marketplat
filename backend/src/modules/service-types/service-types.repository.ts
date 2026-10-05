import { prisma } from '../../config/prisma';
import { Prisma } from '@prisma/client';
import { CreateServiceTypeFieldInput, CreateServiceTypeInput, UpdateServiceTypeFieldInput, UpdateServiceTypeInput } from './service-types.validation';

export const serviceTypesRepository = {
  findActive: () => prisma.serviceType.findMany({
    where: { isActive: true },
    include: { fields: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] } },
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
  }),
  findAllForAdmin: () => prisma.serviceType.findMany({
    include: { fields: { orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] }, _count: { select: { categories: true, listings: true } } },
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
  }),
  findById: (id: string) => prisma.serviceType.findUnique({ where: { id } }),
  findActiveById: (id: string) => prisma.serviceType.findUnique({ where: { id, isActive: true }, include: { fields: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] } } }),
  findByIdWithFields: (id: string) => prisma.serviceType.findUnique({ where: { id }, include: { fields: { where: { isActive: true }, orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] } } }),
  findByIdWithAllFields: (id: string) => prisma.serviceType.findUnique({ where: { id }, include: { fields: { orderBy: [{ sortOrder: 'asc' }, { key: 'asc' }] } } }),
  // Listing creation locks the type row so an admin cannot deactivate a
  // ServiceType between validation and the listing insert.
  lockForListingCreation: async (tx: Prisma.TransactionClient, id: string): Promise<boolean | null> => {
    const rows = await tx.$queryRaw<Array<{ isActive: boolean }>>`
      SELECT "isActive"
      FROM "service_types"
      WHERE "id" = ${id}
      FOR UPDATE
    `;
    return rows.length ? rows[0].isActive : null;
  },
  findBySlug: (slug: string) => prisma.serviceType.findUnique({ where: { slug } }),
  create: (data: CreateServiceTypeInput) => prisma.serviceType.create({ data: { ...data, labels: data.labels as Prisma.InputJsonValue, capabilities: data.capabilities as Prisma.InputJsonValue, presentation: data.presentation as Prisma.InputJsonValue } }),
  update: (id: string, data: UpdateServiceTypeInput) => prisma.serviceType.update({ where: { id }, data: ({ ...data, ...(data.labels !== undefined ? { labels: data.labels as unknown as Prisma.InputJsonValue } : {}), ...(data.capabilities !== undefined ? { capabilities: data.capabilities as unknown as Prisma.InputJsonValue } : {}), ...(data.presentation !== undefined ? { presentation: data.presentation as unknown as Prisma.InputJsonValue } : {}) }) as unknown as Prisma.ServiceTypeUncheckedUpdateInput }),
  createField: (data: CreateServiceTypeFieldInput) => prisma.serviceTypeField.create({ data: { ...data, options: data.options === undefined ? undefined : data.options as Prisma.InputJsonValue } }),
  findFieldById: (id: string) => prisma.serviceTypeField.findUnique({ where: { id } }),
  updateField: (id: string, data: UpdateServiceTypeFieldInput) => prisma.serviceTypeField.update({ where: { id }, data: ({ ...data, ...(data.options !== undefined ? { options: data.options as unknown as Prisma.InputJsonValue } : {}) }) as unknown as Prisma.ServiceTypeFieldUncheckedUpdateInput }),
  deleteField: (id: string) => prisma.serviceTypeField.update({ where: { id }, data: { isActive: false } }),
};
