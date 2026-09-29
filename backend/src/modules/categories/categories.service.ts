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

// FIX CATEGORIES-CACHE-VERSION-01: versioned key. Warmup/cache-aside never
// overwrite an existing key, so a deploy that changes the payload shape would
// otherwise keep serving the old shape for up to the 1h TTL. Bump the suffix
// whenever the cached shape changes.
const CATEGORIES_CACHE_KEY = 'categories:all:v1';
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

    // T420 — a nonexistent parentId would surface as a raw P2003 (FK
    // violation) turned 500. Check up-front for a clean 400.
    // T425 — also enforce the 2-level tree constraint: a parent that
    // is itself a child would create a grandchild the public/admin
    // trees (findMany's single-level children include) cannot render.
    if (input.parentId) {
      const parent = await categoriesRepository.findById(input.parentId);
      if (!parent) {
        throw new BadRequestError('Parent category not found', 'PARENT_CATEGORY_NOT_FOUND');
      }
      if (parent.parentId !== null) {
        throw new BadRequestError(
          'Categories support only two levels (top-level + direct children).',
          'CATEGORY_DEPTH_EXCEEDED',
        );
      }
    }

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

  /**
   * FIX ADMIN-CATEGORIES-FRESH-01: admin list — deliberately bypasses the
   * Redis cache getCategories() uses (CATEGORIES_CACHE_KEY). That cache
   * is public-facing and holds the shape public consumers need at an
   * hour of staleness; an admin editing or deleting a category must see
   * their change immediately. Same reasoning as
   * service-categories.service.ts's getServiceCategoriesForAdmin and
   * product-categories.service.ts's counterpart.
   */
  getCategoriesForAdmin: async () => {
    return categoriesRepository.findManyForAdmin();
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
      // T421 — verify the target parent actually exists before walking
      // its chain; a nonexistent id would otherwise return an empty
      // chain and pass through to a P2003 on write (500).
      const proposedParent = await categoriesRepository.findById(input.parentId);
      if (!proposedParent) {
        throw new BadRequestError('Parent category not found', 'PARENT_CATEGORY_NOT_FOUND');
      }
      // T425 — same 2-level constraint as createCategory above.
      if (proposedParent.parentId !== null) {
        throw new BadRequestError(
          'Categories support only two levels (top-level + direct children).',
          'CATEGORY_DEPTH_EXCEEDED',
        );
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
    try {
      await categoriesRepository.delete(id);
    } catch (err) {
      // T424 — the count checks above are advisory; a child or ad can
      // be created between the count and the delete. The DB's FK
      // constraint is the real guard — surface it as a clean 400 (P2003)
      // or 404 (P2025, already deleted concurrently), not a 500.
      if (isPrismaError(err, 'P2003')) {
        throw new BadRequestError('Cannot delete category — it is still referenced.');
      }
      if (isPrismaError(err, 'P2025')) {
        throw new NotFoundError('Category not found', 'CATEGORY_NOT_FOUND');
      }
      throw err;
    }
    await invalidateCategoriesCache(); // P-04: write-through invalidation
  },
};
