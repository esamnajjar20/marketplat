import { Prisma } from '@prisma/client';
import { customersRepository } from './customers.repository';
import { CreateCustomerInput, UpdateCustomerInput } from './customers.validation';
import { ConflictError } from '../../shared/errors/ConflictError';
import { NotFoundError } from '../../shared/errors/NotFoundError';

const normalizePhone = (phone?: string | null) => {
  if (!phone) return null;
  return phone.replace(/[^\d+]/g, '');
};

export const customersService = {
  normalizePhone,
  list: (sellerId: string, query: { page?: number; limit?: number; q?: string; dueOnly?: boolean }) => customersRepository.list(sellerId, query),
  summary: (sellerId: string) => customersRepository.summary(sellerId),
  search: (sellerId: string, q: string) => customersRepository.search(sellerId, q),
  getById: async (sellerId: string, id: string) => {
    const customer = await customersRepository.findBySellerAndId(sellerId, id);
    if (!customer) throw new NotFoundError('Customer not found.', 'CUSTOMER_NOT_FOUND');
    return customer;
  },
  create: async (sellerId: string, input: CreateCustomerInput) => {
    const phone = normalizePhone(input.phone);
    if (phone) {
      const existing = await customersRepository.findByPhone(sellerId, phone);
      if (existing) throw new ConflictError('A customer with this phone already exists.', 'CUSTOMER_PHONE_EXISTS');
    }
    return customersRepository.create({
      seller: { connect: { id: sellerId } },
      name: input.name,
      phone,
      email: input.email ?? null,
      address: input.address ?? null,
      note: input.note ?? null,
      tags: input.tags,
    });
  },
  update: async (sellerId: string, id: string, input: UpdateCustomerInput) => {
    const customer = await customersRepository.findBySellerAndId(sellerId, id);
    if (!customer) throw new NotFoundError('Customer not found.', 'CUSTOMER_NOT_FOUND');
    const phone = input.phone === undefined ? undefined : normalizePhone(input.phone);
    if (phone) {
      const existing = await customersRepository.findByPhone(sellerId, phone);
      if (existing && existing.id !== id) throw new ConflictError('A customer with this phone already exists.', 'CUSTOMER_PHONE_EXISTS');
    }
    const data: Prisma.CustomerUpdateInput = { ...input, ...(input.phone !== undefined ? { phone } : {}) };
    return customersRepository.update(id, data);
  },
};
