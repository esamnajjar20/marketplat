import { StoreCollection, Product } from '@prisma/client';
import { collectionsRepository, StoreCollectionWithCount } from './collections.repository';
import { productsRepository } from '../products/products.repository';
import { requireOwnStoreForProducts } from '../stores/stores.service';
import { storesRepository } from '../stores/stores.repository';
import { generateStoreSlug, withSlugSuffix } from '../../shared/utils/slugify';
import {
  CreateCollectionInput,
  UpdateCollectionInput,
  ReorderCollectionsInput,
} from './collections.validation';
import { NotFoundError } from '../../shared/errors/NotFoundError';
import { ForbiddenError } from '../../shared/errors/ForbiddenError';
import { ConflictError } from '../../shared/errors/ConflictError';
import { BadRequestError } from '../../shared/errors/BadRequestError';

// COLLECTIONS (P1): slug is scoped to the store (@@unique([storeId,
// slug]) in schema.prisma), so collision-retry only needs to check
// within this one store's existing collections — reuses the same
// generateStoreSlug/withSlugSuffix helpers stores.service.ts uses for
// its own (globally-unique) slug, since the base slugify logic is
// identical; only the collision-check scope differs.
const generateUniqueCollectionSlug = async (storeId: string, name: string): Promise<string> => {
  const base = generateStoreSlug(name);
  let candidate = base;
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const existing = await collectionsRepository.findBySlugInStore(storeId, candidate);
    if (!existing) return candidate;
    candidate = withSlugSuffix(base);
  }
  return withSlugSuffix(base);
};

const requireOwnCollection = async (userId: string, id: string): Promise<StoreCollection> => {
  const store = await requireOwnStoreForProducts(userId);
  const collection = await collectionsRepository.findById(id);
  if (!collection) throw new NotFoundError('Collection not found', 'COLLECTION_NOT_FOUND');
  if (collection.storeId !== store.id) {
    throw new ForbiddenError('You do not own this collection.', 'NOT_YOUR_COLLECTION');
  }
  return collection;
};

export const collectionsService = {
  createCollection: async (
    userId: string,
    input: CreateCollectionInput
  ): Promise<StoreCollection> => {
    const store = await requireOwnStoreForProducts(userId);
    const slug = await generateUniqueCollectionSlug(store.id, input.name);

    try {
      return await collectionsRepository.create({
        storeId: store.id,
        name: input.name,
        slug,
        description: input.description,
        imageUrl: input.imageUrl,
      });
    } catch (error) {
      // Belt-and-suspenders against the same race generateUniqueSlug
      // guards against in stores.service.ts — the retry loop above
      // makes this vanishingly unlikely, not impossible.
      if (collectionsRepository.isUniqueConstraintError(error)) {
        throw new ConflictError('A collection with this name already exists.', 'COLLECTION_SLUG_TAKEN');
      }
      throw error;
    }
  },

  getMyCollections: async (userId: string): Promise<StoreCollectionWithCount[]> => {
    const store = await requireOwnStoreForProducts(userId);
    return collectionsRepository.findByStoreId(store.id);
  },

  getCollectionById: async (userId: string, id: string): Promise<StoreCollection> =>
    requireOwnCollection(userId, id),

  updateCollection: async (
    userId: string,
    id: string,
    input: UpdateCollectionInput
  ): Promise<StoreCollection> => {
    const collection = await requireOwnCollection(userId, id);

    // Renaming re-derives the slug (same "slug follows name" choice
    // stores.service.ts's updateStore makes) — a collection's slug is
    // scoped to the store and low-stakes to change, unlike
    // StoreDetails.slug which is deliberately immutable because it's
    // the thing shared links point at.
    let slug: string | undefined;
    if (input.name && input.name !== collection.name) {
      slug = await generateUniqueCollectionSlug(collection.storeId, input.name);
    }

    return collectionsRepository.update(id, { ...input, slug });
  },

  deleteCollection: async (userId: string, id: string): Promise<void> => {
    await requireOwnCollection(userId, id);
    await collectionsRepository.delete(id);
  },

  reorderCollections: async (userId: string, input: ReorderCollectionsInput): Promise<void> => {
    const store = await requireOwnStoreForProducts(userId);
    const owned = await collectionsRepository.findByStoreId(store.id);
    const ownedIds = new Set(owned.map(c => c.id));

    // T402 — a duplicated id (e.g. [a, a, b] against owned {a, b, c})
    // passes the length + membership checks but leaves one collection
    // untouched and gives another a duplicate sortOrder. Reject any
    // duplicate before comparing to the owned set.
    const uniqueRequested = new Set(input.orderedIds);
    if (
      uniqueRequested.size !== input.orderedIds.length ||
      input.orderedIds.length !== owned.length ||
      !input.orderedIds.every(id => ownedIds.has(id))
    ) {
      throw new BadRequestError('orderedIds must match this store\'s collections exactly.');
    }

    await collectionsRepository.reorder(store.id, input.orderedIds);
  },

  addProduct: async (userId: string, collectionId: string, productId: string): Promise<void> => {
    const collection = await requireOwnCollection(userId, collectionId);

    const product = await productsRepository.findById(productId);
    if (!product || product.status === 'DELETED') {
      throw new NotFoundError('Product not found', 'PRODUCT_NOT_FOUND');
    }
    if (product.storeId !== collection.storeId) {
      throw new ForbiddenError('You do not own this product.', 'NOT_YOUR_PRODUCT');
    }

    const alreadyMember = await collectionsRepository.isMember(collectionId, productId);
    if (alreadyMember) return;

    const sortOrder = await collectionsRepository.nextSortOrder(collectionId);
    try {
      await collectionsRepository.addProduct(collectionId, productId, sortOrder);
    } catch (error) {
      // T405 — concurrent double-add races past isMember; the
      // (collectionId, productId) unique constraint is the real guard.
      // Treat the loser as a no-op (the desired end state is achieved).
      if (!collectionsRepository.isMembershipConflict(error)) throw error;
    }
  },

  removeProduct: async (userId: string, collectionId: string, productId: string): Promise<void> => {
    await requireOwnCollection(userId, collectionId);
    await collectionsRepository.removeProduct(collectionId, productId);
  },

  // --- Public (storefront) reads ---

  getPublicCollections: async (storeIdOrSlug: string): Promise<StoreCollectionWithCount[]> => {
    // Same id-then-slug fallback as stores.service.ts's getPublicStore,
    // but deliberately NOT calling that function directly: it
    // fire-and-forgets storesRepository.incrementViews on every call,
    // and a visitor opening the Collections tab must not double-count
    // a store view on top of the one the store page itself already
    // recorded.
    const store =
      (await storesRepository.findById(storeIdOrSlug)) ??
      (await storesRepository.findBySlug(storeIdOrSlug));
    if (!store || store.status !== 'ACTIVE') {
      throw new NotFoundError('Store not found', 'STORE_NOT_FOUND');
    }
    return collectionsRepository.findActiveByStoreId(store.id);
  },

  getPublicCollectionProducts: async (collectionId: string): Promise<Product[]> => {
    const collection = await collectionsRepository.findById(collectionId);
    if (!collection || !collection.isActive) {
      throw new NotFoundError('Collection not found', 'COLLECTION_NOT_FOUND');
    }
    // T403 — a collection inside a suspended/inactive store must not
    // leak its products. getPublicCollections already gates on
    // store.status === 'ACTIVE'; this path bypassed that check.
    const store = await storesRepository.findById(collection.storeId);
    if (!store || store.status !== 'ACTIVE') {
      throw new NotFoundError('Collection not found', 'COLLECTION_NOT_FOUND');
    }
    const rows = await collectionsRepository.findVisibleProducts(collectionId);
    return rows.map(row => row.product);
  },
};
