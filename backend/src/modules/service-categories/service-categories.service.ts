import {
  serviceCategoriesRepository,
  ServiceCategoryWithChildren,
} from './service-categories.repository';
import { ServiceCategory } from '@prisma/client';
import { CreateServiceCategoryInput, UpdateServiceCategoryInput } from './service-categories.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';
import { isPrismaError } from '../../shared/utils/prismaErrors';

// FIX CATEGORIES-CACHE-VERSION-01: versioned key — bump the suffix whenever
// the cached payload shape changes (see categories.service.ts).
const SERVICE_CATEGORIES_CACHE_KEY = 'service_categories:all:v1';
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

    // T440 — reject unknown parentId before it falls through to a raw
    // P2003 -> 500.
    // T425 — same 2-level depth guard as categories.
    if (input.parentId) {
      const parent = await serviceCategoriesRepository.findById(input.parentId);
      if (!parent) {
        throw new BadRequestError('Parent category not found', 'PARENT_CATEGORY_NOT_FOUND');
      }
      if (parent.parentId !== null) {
        throw new BadRequestError(
          'Service categories support only two levels (top-level + direct children).',
          'CATEGORY_DEPTH_EXCEEDED',
        );
      }
    }

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

  // EPIC 1.2: admin management list — deliberately bypasses the
  // service-categories cache (SERVICE_CATEGORIES_CACHE_KEY) used by
  // getServiceCategories above. That cache is public-facing and only
  // ever holds the isActive-filtered tree; an admin toggling a
  // category's isActive or editing it needs the live, uncached, full
  // set (including inactive categories) every time, and this is a
  // low-traffic admin-only endpoint where the 1-hour cache would only
  // cause confusion (edit a category, still see the stale version).
  getServiceCategoriesForAdmin: async () => {
    return serviceCategoriesRepository.findManyForAdmin();
  },

  getServiceCategoryById: async (id: string): Promise<ServiceCategory> => {
    // T510 — public read: a deactivated category must 404 here even
    // though it still resolves through the admin-facing findById.
    const category = await serviceCategoriesRepository.findPublicById(id);
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

    // T441 — cycle guard, mirroring categoriesService and
    // productCategoriesService. This module shipped WITHOUT one, so a
    // self-referential parentId was accepted silently and any code
    // walking the chain would hang.
    if (input.parentId && input.parentId !== category.parentId) {
      if (input.parentId === id) {
        throw new BadRequestError('A category cannot be its own parent', 'CIRCULAR_CATEGORY_REFERENCE');
      }
      // T442 — verify the target parent exists first; an unknown id
      // returned an empty chain and passed the cycle check silently.
      const proposedParent = await serviceCategoriesRepository.findById(input.parentId);
      if (!proposedParent) {
        throw new BadRequestError('Parent category not found', 'PARENT_CATEGORY_NOT_FOUND');
      }
      // T425 — same 2-level depth constraint as categories.
      if (proposedParent.parentId !== null) {
        throw new BadRequestError(
          'Service categories support only two levels (top-level + direct children).',
          'CATEGORY_DEPTH_EXCEEDED',
        );
      }
      const ancestorChain = await serviceCategoriesRepository.findParentChain(input.parentId);
      if (ancestorChain.includes(id)) {
        throw new BadRequestError(
          'Cannot set parent to one of this category\'s own subcategories',
          'CIRCULAR_CATEGORY_REFERENCE'
        );
      }
    }

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

    // T443 — same guard the sibling modules have: a category with
    // subcategories (children.parentId) would hit the FK constraint
    // on delete.
    const childrenCount = await serviceCategoriesRepository.countChildren(id);
    if (childrenCount > 0) {
      throw new BadRequestError(`Cannot delete category with ${childrenCount} subcategories`);
    }

    try {
      await serviceCategoriesRepository.delete(id);
    } catch (err) {
      // T444 — the counts above are advisory; a child can
      // appear between the count and the delete. P2003 -> 400,
      // P2025 -> 404.
      if (isPrismaError(err, 'P2003')) {
        throw new BadRequestError('Cannot delete category — it is still referenced.');
      }
      if (isPrismaError(err, 'P2025')) {
        throw new NotFoundError('Service category not found', 'SERVICE_CATEGORY_NOT_FOUND');
      }
      throw err;
    }
    await invalidateServiceCategoriesCache();
  },
};
