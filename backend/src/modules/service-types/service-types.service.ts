import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { isPrismaError } from '../../shared/utils/prismaErrors';
import { serviceTypesRepository } from './service-types.repository';
import { CreateServiceTypeFieldInput, CreateServiceTypeInput, UpdateServiceTypeFieldInput, UpdateServiceTypeInput } from './service-types.validation';

const CACHE_KEY = 'service_types:active:v1';
const CACHE_TTL = 30 * 60;

async function invalidate(): Promise<void> {
  try { await redis.del(CACHE_KEY); } catch { logger.warn('Service types cache invalidation failed'); }
}

export async function validateServiceListingAttributes(
  serviceTypeId: string,
  attributes: Record<string, unknown> | undefined,
): Promise<void> {
  const serviceType = await serviceTypesRepository.findActiveById(serviceTypeId);
  if (!serviceType) {
    throw new BadRequestError('Invalid or inactive service type.', 'SERVICE_TYPE_INVALID');
  }
  const fields = serviceType.fields.filter((field) => field.scope === 'LISTING');
  const values = attributes ?? {};
  const allowed = new Map(fields.map((field) => [field.key, field]));

  for (const key of Object.keys(values)) {
    if (!allowed.has(key)) {
      throw new BadRequestError(`Unknown service attribute: ${key}`, 'SERVICE_ATTRIBUTE_NOT_ALLOWED');
    }
  }

  for (const field of fields) {
    const value = values[field.key];
    if (field.required && (value === undefined || value === null || value === '')) {
      throw new BadRequestError(`${field.labelAr} is required.`, 'SERVICE_ATTRIBUTE_REQUIRED');
    }
    if (value === undefined || value === null || value === '') continue;
    const options = Array.isArray(field.options) ? field.options as Array<{ value: string }> : [];
    if (field.type === 'TEXT' || field.type === 'TEXTAREA' || field.type === 'SELECT') {
      if (typeof value !== 'string') throw new BadRequestError(`Invalid value for ${field.key}.`, 'SERVICE_ATTRIBUTE_INVALID');
    }
    if (field.type === 'NUMBER' && (typeof value !== 'number' || !Number.isFinite(value))) {
      throw new BadRequestError(`Invalid value for ${field.key}.`, 'SERVICE_ATTRIBUTE_INVALID');
    }
    if (field.type === 'BOOLEAN' && typeof value !== 'boolean') {
      throw new BadRequestError(`Invalid value for ${field.key}.`, 'SERVICE_ATTRIBUTE_INVALID');
    }
    if (field.type === 'MULTI_SELECT' && (!Array.isArray(value) || value.some((item) => typeof item !== 'string'))) {
      throw new BadRequestError(`Invalid value for ${field.key}.`, 'SERVICE_ATTRIBUTE_INVALID');
    }
    if (options.length > 0) {
      const valid = new Set(options.map((option) => option.value));
      if (field.type === 'SELECT' && !valid.has(value as string)) {
        throw new BadRequestError(`Invalid option for ${field.key}.`, 'SERVICE_ATTRIBUTE_INVALID');
      }
      if (field.type === 'MULTI_SELECT' && (value as string[]).some((item) => !valid.has(item))) {
        throw new BadRequestError(`Invalid option for ${field.key}.`, 'SERVICE_ATTRIBUTE_INVALID');
      }
    }
  }
}

export const serviceTypesService = {
  getActive: async () => {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached);
    } catch { logger.warn('Service types cache read failed'); }
    const result = await serviceTypesRepository.findActive();
    try { await redis.setex(CACHE_KEY, CACHE_TTL, JSON.stringify(result)); } catch { logger.warn('Service types cache write failed'); }
    return result;
  },
  getAllForAdmin: () => serviceTypesRepository.findAllForAdmin(),
  create: async (input: CreateServiceTypeInput) => {
    if (await serviceTypesRepository.findBySlug(input.slug)) throw new BadRequestError('Service type slug already exists', 'SERVICE_TYPE_SLUG_EXISTS');
    try { const result = await serviceTypesRepository.create(input); await invalidate(); return result; }
    catch (error) { if (isPrismaError(error, 'P2002')) throw new BadRequestError('Service type already exists', 'SERVICE_TYPE_EXISTS'); throw error; }
  },
  update: async (id: string, input: UpdateServiceTypeInput) => {
    if (!(await serviceTypesRepository.findById(id))) throw new NotFoundError('Service type not found', 'SERVICE_TYPE_NOT_FOUND');
    try { const result = await serviceTypesRepository.update(id, input); await invalidate(); return result; }
    catch (error) { if (isPrismaError(error, 'P2002')) throw new BadRequestError('Service type already exists', 'SERVICE_TYPE_EXISTS'); throw error; }
  },
  createField: async (input: CreateServiceTypeFieldInput) => {
    if (!(await serviceTypesRepository.findById(input.serviceTypeId))) throw new BadRequestError('Service type not found', 'SERVICE_TYPE_NOT_FOUND');
    try { const result = await serviceTypesRepository.createField(input); await invalidate(); return result; }
    catch (error) { if (isPrismaError(error, 'P2002')) throw new BadRequestError('Field key already exists for this service type', 'SERVICE_TYPE_FIELD_EXISTS'); throw error; }
  },
  updateField: async (id: string, input: UpdateServiceTypeFieldInput) => {
    if (!(await serviceTypesRepository.findFieldById(id))) throw new NotFoundError('Service type field not found', 'SERVICE_TYPE_FIELD_NOT_FOUND');
    const result = await serviceTypesRepository.updateField(id, input); await invalidate(); return result;
  },
  deleteField: async (id: string) => {
    if (!(await serviceTypesRepository.findFieldById(id))) throw new NotFoundError('Service type field not found', 'SERVICE_TYPE_FIELD_NOT_FOUND');
    await serviceTypesRepository.deleteField(id); await invalidate();
  },
};
