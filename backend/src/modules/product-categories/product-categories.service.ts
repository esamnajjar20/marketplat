import {
  productCategoriesRepository,
  ProductCategoryWithChildren,
} from './product-categories.repository';
import { ProductCategory, Prisma } from '@prisma/client';
import { CreateProductCategoryInput, UpdateProductCategoryInput } from './product-categories.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { redis } from '../../config/redis';
import { logger } from '../../shared/utils/logger';

const isPrismaError = (err: unknown, code: string): boolean =>
  err instanceof Prisma.PrismaClientKnownRequestError && err.code === code;

const PRODUCT_CATEGORIES_CACHE_KEY = 'product_categories:all';
const PRODUCT_CATEGORIES_TTL = 60 * 60; // 1 hour, same as service categories

const invalidateProductCategoriesCache = async (): Promise<void> => {
  try {
    await redis.del(PRODUCT_CATEGORIES_CACHE_KEY);
  } catch {
    // silent fail — cache miss is acceptable
  }
};

export const productCategoriesService = {
  createProductCategory: async (input: CreateProductCategoryInput): Promise<ProductCategory> => {
    const [existingName, existingNameAr, existingSlug] = await Promise.all([
      productCategoriesRepository.findByName(input.name),
      productCategoriesRepository.findByNameAr(input.nameAr),
      productCategoriesRepository.findBySlug(input.slug),
    ]);
    if (existingName) throw new BadRequestError('Product category name already exists');
    if (existingNameAr) throw new BadRequestError('Arabic product category name already exists');
    if (existingSlug) throw new BadRequestError('Product category slug already exists');

    try {
      const category = await productCategoriesRepository.create(input);
      await invalidateProductCategoriesCache();
      return category;
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new BadRequestError('Product category name or slug already exists');
      }
      throw err;
    }
  },

  getProductCategories: async (): Promise<ProductCategoryWithChildren[]> => {
    try {
      const cached = await redis.get(PRODUCT_CATEGORIES_CACHE_KEY);
      if (cached) return JSON.parse(cached) as ProductCategoryWithChildren[];
    } catch {
      logger.warn('Product categories cache read failed, falling back to DB');
    }

    const categories = await productCategoriesRepository.findMany();

    try {
      await redis.setex(
        PRODUCT_CATEGORIES_CACHE_KEY,
        PRODUCT_CATEGORIES_TTL,
        JSON.stringify(categories)
      );
    } catch {
      // Fail silently — DB result is still returned
    }

    return categories;
  },

  getProductCategoriesForAdmin: async () => {
    return productCategoriesRepository.findManyForAdmin();
  },

  getProductCategoryById: async (id: string): Promise<ProductCategory> => {
    const category = await productCategoriesRepository.findById(id);
    if (!category) throw new NotFoundError('Product category not found', 'PRODUCT_CATEGORY_NOT_FOUND');
    return category;
  },

  getProductCategoryBySlug: async (slug: string): Promise<ProductCategory> => {
    const category = await productCategoriesRepository.findBySlug(slug);
    if (!category) throw new NotFoundError('Product category not found', 'PRODUCT_CATEGORY_NOT_FOUND');
    return category;
  },

  updateProductCategory: async (
    id: string,
    input: UpdateProductCategoryInput
  ): Promise<ProductCategory> => {
    const category = await productCategoriesRepository.findById(id);
    if (!category) throw new NotFoundError('Product category not found', 'PRODUCT_CATEGORY_NOT_FOUND');

    if (input.slug && input.slug !== category.slug) {
      const existing = await productCategoriesRepository.findBySlug(input.slug);
      if (existing) throw new BadRequestError('Slug already in use');
    }
    if (input.name && input.name !== category.name) {
      const existing = await productCategoriesRepository.findByName(input.name);
      if (existing) throw new BadRequestError('Product category name already in use');
    }
    if (input.nameAr && input.nameAr !== category.nameAr) {
      const existing = await productCategoriesRepository.findByNameAr(input.nameAr);
      if (existing) throw new BadRequestError('Arabic name already in use');
    }

    try {
      const updated = await productCategoriesRepository.update(id, input);
      await invalidateProductCategoriesCache();
      return updated;
    } catch (err) {
      if (isPrismaError(err, 'P2002')) {
        throw new BadRequestError('Product category name, Arabic name, or slug already exists');
      }
      throw err;
    }
  },

  deleteProductCategory: async (id: string): Promise<void> => {
    const category = await productCategoriesRepository.findById(id);
    if (!category) throw new NotFoundError('Product category not found', 'PRODUCT_CATEGORY_NOT_FOUND');

    const productsCount = await productCategoriesRepository.countProducts(id);
    if (productsCount > 0) {
      throw new BadRequestError(`Cannot delete category with ${productsCount} active products`);
    }

    await productCategoriesRepository.delete(id);
    await invalidateProductCategoriesCache();
  },
};
