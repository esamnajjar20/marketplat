import { prisma } from '../../config/prisma';
import { Product } from '@prisma/client';
import { productsRepository, ProductWithStore } from './products.repository';
import { CreateProductInput, UpdateProductInput, GetProductsQuery } from './products.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { BadRequestError } from '../../shared/errors/BadRequestError';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { uploadImage, deleteImage } from '../../config/cloudinary';
import { extractCloudinaryPublicId, cleanupUploadedImages } from '../../shared/utils/cloudinaryHelpers';
import { storesRepository } from '../stores/stores.repository';
import { requireOwnStoreForProducts } from '../stores/stores.service';
import { productCategoriesRepository } from '../product-categories/product-categories.repository';
import { storeFollowersRepository } from '../stores/store-followers.repository';
import { notificationEvents } from '../notifications/notifications.service';

const MAX_PRODUCT_IMAGES = 10; // same cap as ads.images / service-listings.images

// Stores proposal's "مجاني: 20 منتج" plan cap. Enforced here in
// application code rather than a DB constraint, same as
// service-listings' availabilityStatus gate — since it depends on
// StoreDetails.plan, not a static schema rule.
const FREE_PLAN_PRODUCT_LIMIT = 20;

export const productsService = {
  createProduct: async (
    userId: string,
    input: CreateProductInput,
    files: Express.Multer.File[]
  ): Promise<Product> => {
    const store = await requireOwnStoreForProducts(userId);

    if (store.status !== 'ACTIVE') {
      throw new ForbiddenError(
        'Your store must be approved before you can publish products.',
        'STORE_NOT_ACTIVE'
      );
    }

    const category = await productCategoriesRepository.findById(input.categoryId);
    if (!category || !category.isActive) {
      throw new BadRequestError('Invalid or inactive product category.');
    }

    if (store.plan === 'FREE') {
      const activeCount = await storesRepository.countActiveProducts(store.id);
      if (activeCount >= FREE_PLAN_PRODUCT_LIMIT) {
        throw new BadRequestError(
          `Free plan stores can list up to ${FREE_PLAN_PRODUCT_LIMIT} products. Upgrade to add more.`,
          'PRODUCT_LIMIT_REACHED'
        );
      }
    }

    if (files.length > MAX_PRODUCT_IMAGES) {
      throw new BadRequestError(`You can upload at most ${MAX_PRODUCT_IMAGES} images.`);
    }

    const uploads = await Promise.all(files.map(file => uploadImage(file.buffer, 'products')));

    let product: Product;
    try {
      product = await prisma.$transaction(async tx =>
        productsRepository.create(tx, store.id, {
          categoryId: input.categoryId,
          name: input.name,
          description: input.description,
          images: uploads.map(u => u.url),
          price: input.price,
          discountPrice: input.discountPrice,
          wholesalePrice: input.wholesalePrice,
          wholesaleMinQty: input.wholesaleMinQty,
          availability: input.availability,
        })
      );
    } catch (error) {
      await cleanupUploadedImages(uploads.map(u => u.publicId));
      throw error;
    }

    // Fire-and-forget fan-out to everyone following this store — a
    // notification failing here must never fail product creation, same
    // convention as every other notificationEvents caller.
    storeFollowersRepository
      .findUserIdsByStoreId(store.id)
      .then(followerIds => notificationEvents.onStoreNewProduct(followerIds, store.id, store.name, product.name))
      .catch(() => undefined);

    return product;
  },

  getMyProducts: async (
    userId: string,
    query: { page?: number; limit?: number; status?: 'ACTIVE' | 'PAUSED' | 'DELETED' }
  ): Promise<PaginatedResult<Product>> => {
    const store = await requireOwnStoreForProducts(userId);
    const { products, total } = await productsRepository.findManyByStoreId(store.id, query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return { items: products, meta: buildPaginationMeta(total, page, limit) };
  },

  getProducts: async (
    query: GetProductsQuery
  ): Promise<PaginatedResult<ProductWithStore>> => {
    const { products, total } = await productsRepository.findMany(query);
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    return { items: products, meta: buildPaginationMeta(total, page, limit) };
  },

  getProductById: async (id: string): Promise<ProductWithStore> => {
    const product = await productsRepository.findPublicById(id);
    if (!product || product.status === 'DELETED') {
      throw new NotFoundError('Product not found', 'PRODUCT_NOT_FOUND');
    }
    // Fire-and-forget: a failed view-count bump shouldn't fail the read.
    productsRepository.incrementViews(id).catch(() => undefined);
    return product;
  },

  updateProduct: async (
    userId: string,
    id: string,
    input: UpdateProductInput
  ): Promise<Product> => {
    const store = await requireOwnStoreForProducts(userId);
    const product = await productsRepository.findById(id);
    if (!product) throw new NotFoundError('Product not found', 'PRODUCT_NOT_FOUND');
    if (product.storeId !== store.id) {
      throw new ForbiddenError('You do not own this product.', 'NOT_YOUR_PRODUCT');
    }

    if (input.categoryId) {
      const category = await productCategoriesRepository.findById(input.categoryId);
      if (!category || !category.isActive) {
        throw new BadRequestError('Invalid or inactive product category.');
      }
    }

    return productsRepository.update(id, input);
  },

  deleteProduct: async (userId: string, id: string): Promise<void> => {
    const store = await requireOwnStoreForProducts(userId);
    const product = await productsRepository.findById(id);
    if (!product) throw new NotFoundError('Product not found', 'PRODUCT_NOT_FOUND');
    if (product.storeId !== store.id) {
      throw new ForbiddenError('You do not own this product.', 'NOT_YOUR_PRODUCT');
    }

    await productsRepository.softDelete(id);

    await Promise.all(
      product.images.map(imageUrl => {
        const publicId = extractCloudinaryPublicId(imageUrl);
        return publicId ? deleteImage(publicId).catch(() => undefined) : undefined;
      })
    );
  },
};
