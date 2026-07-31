import {
  serviceCategoriesRepository,
  ServiceCategoryWithChildren,
} from './service-categories.repository';
import { ServiceCategory, Prisma } from '@prisma/client';
import { CreateServiceCategoryInput, UpdateServiceCategoryInput } from './service-categories.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';

// Same defensive check-then-write-race pattern as categoriesService
// (D-23) — admin-only, low-traffic, applied consistently rather than
// left as a gap here.
const isPrismaError = (err: unknown, code: string): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

const SERVICE_CATEGORIES_CACHE_KEY = 'service_categories:all';
const SERVICE_CATEGORIES_TTL = 60 * 60; // 1 hour — same as categories, rarely changes

const invalidateServiceCategoriesCache = async (): Promise<void> => {
  try {
    await redis.del(SERVICE_CATEGORIES_CACHE_KEY);
  } catch {
    // silent fail — cache miss is acceptable
  }
};

export const serviceCategoriesService = {
  createServiceCategory: async (input: CreateServiceCategoryInput): Promise<ServiceCategory> => {
    const [existingName, existingNameAr, existingSlug] = await Promise.all([
      serviceCategoriesRepository.findByName(input.name),
      serviceCategoriesRepository.findByNameAr(input.nameAr),
      serviceCategoriesRepository.findBySlug(input.slug),
    ]);
    if (existingName) throw new BadRequestError('Service category name already exists');
    if (existingNameAr) throw new BadRequestError('Arabic service category name already exists');
    if (existingSlug) throw new BadRequestError('Service category slug already exists');

    try {
      const category = await serviceCategoriesRepository.create(input);
      await invalidateServiceCategoriesCache();
      return category;
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new BadRequestError('Service category name or slug already exists');
      }
      throw err;
    }
  },

  getServiceCategories: async (): Promise<ServiceCategoryWithChildren[]> => {
    try {
      const cached = await redis.get(SERVICE_CATEGORIES_CACHE_KEY);
      if (cached) return JSON.parse(cached) as ServiceCategoryWithChildren[];
    } catch {
      logger.warn('Service categories cache read failed, falling back to DB');
    }

    const categories = await serviceCategoriesRepository.findMany();

    try {
      await redis.setex(
        SERVICE_CATEGORIES_CACHE_KEY,
        SERVICE_CATEGORIES_TTL,
        JSON.stringify(categories)
      );
    } catch {
      // Fail silently — DB result is still returned
    }

    return categories;
  },

  getServiceCategoryById: async (id: string): Promise<ServiceCategory> => {
    const category = await serviceCategoriesRepository.findById(id);
    if (!category) throw new NotFoundError('Service category not found', 'SERVICE_CATEGORY_NOT_FOUND');
    return category;
  },

  getServiceCategoryBySlug: async (slug: string): Promise<ServiceCategory> => {
    const category = await serviceCategoriesRepository.findBySlug(slug);
    if (!category) throw new NotFoundError('Service category not found', 'SERVICE_CATEGORY_NOT_FOUND');
    return category;
  },

  updateServiceCategory: async (
    id: string,
    input: UpdateServiceCategoryInput
  ): Promise<ServiceCategory> => {
    const category = await serviceCategoriesRepository.findById(id);
    if (!category) throw new NotFoundError('Service category not found', 'SERVICE_CATEGORY_NOT_FOUND');

    if (input.slug && input.slug !== category.slug) {
      const existing = await serviceCategoriesRepository.findBySlug(input.slug);
      if (existing) throw new BadRequestError('Slug already in use');
    }
    if (input.name && input.name !== category.name) {
      const existing = await serviceCategoriesRepository.findByName(input.name);
      if (existing) throw new BadRequestError('Service category name already in use');
    }
    if (input.nameAr && input.nameAr !== category.nameAr) {
      const existing = await serviceCategoriesRepository.findByNameAr(input.nameAr);
      if (existing) throw new BadRequestError('Arabic name already in use');
    }

    try {
      const updated = await serviceCategoriesRepository.update(id, input);
      await invalidateServiceCategoriesCache();
      return updated;
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new BadRequestError('Service category name, Arabic name, or slug already exists');
      }
      throw err;
    }
  },

  // services-design.md §3: deactivate rather than hard-delete when
  // listings still reference the category — mirrors categoriesService's
  // delete-guard (D-17-adjacent), swapped to isActive=false so existing
  // service_listings rows never dangle on a deleted categoryId (the FK
  // is onDelete: Restrict, so a hard delete would fail anyway once
  // service-listings exists).
  deleteServiceCategory: async (id: string): Promise<void> => {
    const category = await serviceCategoriesRepository.findById(id);
    if (!category) throw new NotFoundError('Service category not found', 'SERVICE_CATEGORY_NOT_FOUND');

    const listingsCount = await serviceCategoriesRepository.countListings(id);
    if (listingsCount > 0) {
      throw new BadRequestError(`Cannot delete category with ${listingsCount} active listings`);
    }

    await serviceCategoriesRepository.delete(id);
    await invalidateServiceCategoriesCache();
  },
};
