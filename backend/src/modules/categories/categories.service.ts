import { categoriesRepository, CategoryWithChildren } from './categories.repository';
import { Category, Prisma } from '@prisma/client';
import { CreateCategoryInput, UpdateCategoryInput } from './categories.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';

// FIX D-23: same pattern already used in favoritesService/reportsService —
// createCategory/updateCategory do a check-then-write on name/nameAr/slug
// uniqueness without catching the resulting P2002 race. Admin-only, very
// low-traffic operations, so this is a low-severity gap in practice, but
// applying the same defensive pattern consistently costs nothing here.
const isPrismaError = (err: unknown, code: string): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

const CATEGORIES_CACHE_KEY = 'categories:all';
const CATEGORIES_TTL = 60 * 60; // 1 hour — categories rarely change

const invalidateCategoriesCache = async (): Promise<void> => {
  try {
    await redis.del(CATEGORIES_CACHE_KEY);
  } catch {
    // silent fail — cache miss is acceptable
  }
};

export const categoriesService = {
  createCategory: async (input: CreateCategoryInput): Promise<Category> => {
    const [existingName, existingNameAr, existingSlug] = await Promise.all([
      categoriesRepository.findByName(input.name),
      categoriesRepository.findByNameAr(input.nameAr),
      categoriesRepository.findBySlug(input.slug),
    ]);
    if (existingName) throw new BadRequestError('Category name already exists');
    if (existingNameAr) throw new BadRequestError('Arabic category name already exists');
    if (existingSlug) throw new BadRequestError('Category slug already exists');

    try {
      const category = await categoriesRepository.create(input);
      await invalidateCategoriesCache(); // P-04: write-through invalidation
      return category;
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new BadRequestError('Category name or slug already exists');
      }
      throw err;
    }
  },

  // P-04: Redis cache with 1-hour TTL
  getCategories: async (): Promise<CategoryWithChildren[]> => {
    try {
      const cached = await redis.get(CATEGORIES_CACHE_KEY);
      if (cached) return JSON.parse(cached) as CategoryWithChildren[];
    } catch {
      // Cache miss — fall through to DB
      logger.warn('Categories cache read failed, falling back to DB');
    }

    const categories = await categoriesRepository.findMany();

    try {
      await redis.setex(CATEGORIES_CACHE_KEY, CATEGORIES_TTL, JSON.stringify(categories));
    } catch {
      // Fail silently — DB result is still returned
    }

    return categories;
  },

  getCategoryById: async (id: string): Promise<Category> => {
    const category = await categoriesRepository.findById(id);
    if (!category) throw new NotFoundError('Category not found', 'CATEGORY_NOT_FOUND');
    return category;
  },

  getCategoryBySlug: async (slug: string): Promise<Category> => {
    const category = await categoriesRepository.findBySlug(slug);
    if (!category) throw new NotFoundError('Category not found', 'CATEGORY_NOT_FOUND');
    return category;
  },

  updateCategory: async (id: string, input: UpdateCategoryInput): Promise<Category> => {
    const category = await categoriesRepository.findById(id);
    if (!category) throw new NotFoundError('Category not found', 'CATEGORY_NOT_FOUND');

    // BUGFIX (circular category reference) — same fix as
    // productCategoriesService.updateProductCategory, applied here for
    // consistency.
    if (input.parentId && input.parentId !== category.parentId) {
      if (input.parentId === id) {
        throw new BadRequestError('A category cannot be its own parent', 'CIRCULAR_CATEGORY_REFERENCE');
      }
      const ancestorChain = await categoriesRepository.findParentChain(input.parentId);
      if (ancestorChain.includes(id)) {
        throw new BadRequestError(
          'Cannot set parent to one of this category\'s own subcategories',
          'CIRCULAR_CATEGORY_REFERENCE'
        );
      }
    }

    if (input.slug && input.slug !== category.slug) {
      const existing = await categoriesRepository.findBySlug(input.slug);
      if (existing) throw new BadRequestError('Slug already in use');
    }
    if (input.name && input.name !== category.name) {
      const existing = await categoriesRepository.findByName(input.name);
      if (existing) throw new BadRequestError('Category name already in use');
    }
    if (input.nameAr && input.nameAr !== category.nameAr) {
      const existing = await categoriesRepository.findByNameAr(input.nameAr);
      if (existing) throw new BadRequestError('Arabic name already in use');
    }

    try {
      const updated = await categoriesRepository.update(id, input);
      await invalidateCategoriesCache(); // P-04: write-through invalidation
      return updated;
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new BadRequestError('Category name, Arabic name, or slug already exists');
      }
      throw err;
    }
  },

  deleteCategory: async (id: string): Promise<void> => {
    const category = await categoriesRepository.findById(id);
    if (!category) throw new NotFoundError('Category not found', 'CATEGORY_NOT_FOUND');
    const adsCount = await categoriesRepository.countAds(id);
    if (adsCount > 0) {
      throw new BadRequestError(`Cannot delete category with ${adsCount} active ads`);
    }
    // BUGFIX (FK violation on delete) — same fix as
    // productCategoriesService.deleteProductCategory.
    const childrenCount = await categoriesRepository.countChildren(id);
    if (childrenCount > 0) {
      throw new BadRequestError(`Cannot delete category with ${childrenCount} subcategories`);
    }
    await categoriesRepository.delete(id);
    await invalidateCategoriesCache(); // P-04: write-through invalidation
  },
};
