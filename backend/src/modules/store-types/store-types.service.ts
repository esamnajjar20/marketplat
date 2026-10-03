import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { isPrismaError } from '../../shared/utils/prismaErrors';
import { bumpPublicListCache } from '../../shared/utils/publicListCache';
import {
  storeTypesRepository,
  StoreTypePublic,
} from './store-types.repository';
import {
  CreateStoreTypeInput,
  UpdateStoreTypeInput,
  UpdateStoreTypeStatusInput,
} from './store-types.validation';

const CACHE_KEY = 'store_types:active:v1';
const CACHE_TTL_SECONDS = 30 * 60;

const publicSummary = (type: Awaited<ReturnType<typeof storeTypesRepository.findActive>>[number]): StoreTypePublic => ({
  id: type.id,
  slug: type.slug,
  nameAr: type.nameAr,
  icon: type.icon,
  labels: type.labels,
  presentation: type.presentation,
  hasActiveStores: type._count.stores > 0,
});

async function invalidate(): Promise<void> {
  try {
    await redis.del(CACHE_KEY);
  } catch {
    logger.warn('Store types cache invalidation failed');
  }
}

export const storeTypesService = {
  getActive: async (): Promise<StoreTypePublic[]> => {
    try {
      const cached = await redis.get(CACHE_KEY);
      if (cached) return JSON.parse(cached) as StoreTypePublic[];
    } catch {
      logger.warn('Store types cache read failed, falling back to DB');
    }

    const types = (await storeTypesRepository.findActive()).map(publicSummary);
    try {
      await redis.setex(CACHE_KEY, CACHE_TTL_SECONDS, JSON.stringify(types));
    } catch {
      logger.warn('Store types cache write failed');
    }
    return types;
  },

  getAllForAdmin: () => storeTypesRepository.findAllForAdmin(),

  create: async (input: CreateStoreTypeInput) => {
    const existing = await storeTypesRepository.findBySlug(input.slug);
    if (existing) throw new BadRequestError('Store type slug already exists', 'STORE_TYPE_SLUG_EXISTS');
    try {
      const created = await storeTypesRepository.create(input);
      await invalidate();
      await bumpPublicListCache('stores');
      return created;
    } catch (error) {
      if (isPrismaError(error, 'P2002')) {
        throw new BadRequestError('Store type slug already exists', 'STORE_TYPE_SLUG_EXISTS');
      }
      throw error;
    }
  },

  update: async (id: string, input: UpdateStoreTypeInput) => {
    const existing = await storeTypesRepository.findById(id);
    if (!existing) throw new NotFoundError('Store type not found', 'STORE_TYPE_NOT_FOUND');
    const updated = await storeTypesRepository.update(id, input);
    await invalidate();
    await bumpPublicListCache('stores');
    return updated;
  },

  updateStatus: async (id: string, input: UpdateStoreTypeStatusInput) => {
    const existing = await storeTypesRepository.findById(id);
    if (!existing) throw new NotFoundError('Store type not found', 'STORE_TYPE_NOT_FOUND');
    const updated = await storeTypesRepository.setActive(id, input.isActive);
    await invalidate();
    await bumpPublicListCache('stores');
    return updated;
  },
};
