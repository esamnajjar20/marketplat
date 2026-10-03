import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { isPrismaError } from '../../shared/utils/prismaErrors';
import { storeTypesRepository } from './store-types.repository';
import { storeTypeFieldsRepository } from './store-type-fields.repository';
import { CreateStoreTypeFieldInput, UpdateStoreTypeFieldInput } from './store-type-fields.validation';

const MAX_FIELDS = 20;
const CACHE_TTL_SECONDS = 30 * 60;
const cacheKey = (storeTypeId: string) => `store_type_fields:${storeTypeId}:active:v1`;

async function invalidate(storeTypeId: string) {
  try { await redis.del(cacheKey(storeTypeId)); } catch { logger.warn('Store type fields cache invalidation failed'); }
}

export type StoreAttributes = Record<string, string | number | boolean>;

export const storeTypeFieldsService = {
  getPublic: async (storeTypeId: string) => {
    const type = await storeTypesRepository.findById(storeTypeId);
    if (!type || !type.isActive) return [];
    try {
      const cached = await redis.get(cacheKey(storeTypeId));
      if (cached) return JSON.parse(cached);
    } catch { logger.warn('Store type fields cache read failed'); }
    const fields = (await storeTypeFieldsRepository.findActive(storeTypeId)).map(({ id, storeTypeId: ownerId, key, labelAr, type, required, options, sortOrder }) => ({ id, storeTypeId: ownerId, key, labelAr, type, required, options, sortOrder }));
    try { await redis.setex(cacheKey(storeTypeId), CACHE_TTL_SECONDS, JSON.stringify(fields)); } catch { logger.warn('Store type fields cache write failed'); }
    return fields;
  },

  getAdmin: async (storeTypeId: string) => {
    const type = await storeTypesRepository.findById(storeTypeId);
    if (!type) throw new NotFoundError('Store type not found', 'STORE_TYPE_NOT_FOUND');
    return storeTypeFieldsRepository.findAll(storeTypeId);
  },

  create: async (storeTypeId: string, input: CreateStoreTypeFieldInput) => {
    const type = await storeTypesRepository.findById(storeTypeId);
    if (!type) throw new NotFoundError('Store type not found', 'STORE_TYPE_NOT_FOUND');
    const count = (await storeTypeFieldsRepository.findAll(storeTypeId)).length;
    if (count >= MAX_FIELDS) throw new BadRequestError('A store type cannot have more than 20 custom fields.', 'STORE_TYPE_FIELD_LIMIT');
    try {
      const created = await storeTypeFieldsRepository.create(storeTypeId, input);
      await invalidate(storeTypeId);
      return created;
    } catch (error) {
      if (isPrismaError(error, 'P2002')) throw new BadRequestError('Field key already exists for this store type.', 'STORE_TYPE_FIELD_KEY_EXISTS');
      throw error;
    }
  },

  update: async (storeTypeId: string, fieldId: string, input: UpdateStoreTypeFieldInput) => {
    const field = await storeTypeFieldsRepository.findById(fieldId);
    if (!field || field.storeTypeId !== storeTypeId) throw new NotFoundError('Store type field not found', 'STORE_TYPE_FIELD_NOT_FOUND');
    const nextType = input.type ?? field.type;
    const nextOptions = input.options === undefined ? field.options : input.options;
    if (nextType === 'SELECT' && !nextOptions) throw new BadRequestError('Select fields require options.', 'STORE_TYPE_FIELD_OPTIONS_REQUIRED');
    if (nextType !== 'SELECT' && nextOptions) throw new BadRequestError('Only select fields may define options.', 'STORE_TYPE_FIELD_OPTIONS_INVALID');
    const updated = await storeTypeFieldsRepository.update(fieldId, input);
    await invalidate(storeTypeId);
    return updated;
  },

  validateAttributes: async (storeTypeId: string, raw: unknown, requireRequired: boolean): Promise<StoreAttributes | null> => {
    if (raw == null) return requireRequired && (await storeTypeFieldsRepository.findActive(storeTypeId)).some(f => f.required)
      ? (() => { throw new BadRequestError('Required store fields are missing.', 'STORE_ATTRIBUTES_REQUIRED'); })()
      : null;
    if (typeof raw !== 'object' || Array.isArray(raw)) throw new BadRequestError('Store attributes must be an object.', 'STORE_ATTRIBUTES_INVALID');
    const input = raw as Record<string, unknown>;
    const fields = await storeTypeFieldsRepository.findActive(storeTypeId);
    const byKey = new Map(fields.map(f => [f.key, f]));
    const keys = Object.keys(input);
    if (keys.length > MAX_FIELDS) throw new BadRequestError('Too many store attributes.', 'STORE_ATTRIBUTES_LIMIT');
    for (const key of keys) {
      const field = byKey.get(key);
      if (!field) throw new BadRequestError(`Unknown store field: ${key}`, 'STORE_ATTRIBUTE_UNKNOWN');
      const value = input[key];
      if (value === null || value === '') {
        if (field.required) throw new BadRequestError(`Field ${field.labelAr} is required.`, 'STORE_ATTRIBUTE_REQUIRED');
        delete input[key];
        continue;
      }
      if (field.type === 'TEXT' && typeof value !== 'string') throw new BadRequestError(`Field ${field.labelAr} must be text.`, 'STORE_ATTRIBUTE_TYPE');
      if (field.type === 'NUMBER' && (typeof value !== 'number' || !Number.isFinite(value))) throw new BadRequestError(`Field ${field.labelAr} must be a number.`, 'STORE_ATTRIBUTE_TYPE');
      if (field.type === 'BOOLEAN' && typeof value !== 'boolean') throw new BadRequestError(`Field ${field.labelAr} must be boolean.`, 'STORE_ATTRIBUTE_TYPE');
      if (field.type === 'SELECT') {
        if (typeof value !== 'string') throw new BadRequestError(`Field ${field.labelAr} has an invalid option.`, 'STORE_ATTRIBUTE_TYPE');
        const options = Array.isArray(field.options) ? field.options : [];
        if (!options.some((o: any) => o?.value === value)) throw new BadRequestError(`Field ${field.labelAr} has an invalid option.`, 'STORE_ATTRIBUTE_OPTION');
      }
    }
    if (requireRequired) {
      for (const field of fields) if (field.required && (input[field.key] === undefined || input[field.key] === null || input[field.key] === '')) {
        throw new BadRequestError(`Field ${field.labelAr} is required.`, 'STORE_ATTRIBUTE_REQUIRED');
      }
    }
    return input as StoreAttributes;
  },
};
