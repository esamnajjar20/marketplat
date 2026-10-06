/**
 * Store collections types — maps to backend's StoreCollection /
 * StoreCollectionProduct Prisma models (backend/src/modules/collections).
 * Verified directly against collections.controller.ts /
 * collections.repository.ts / collections.validation.ts /
 * prisma/schema.prisma:
 *
 *   - A collection always belongs to a StoreDetails (owner-only CRUD,
 *     enforced server-side via requireOwnStoreForProducts /
 *     requireOwnCollection — same convention as promotion.types.ts).
 *   - Membership (StoreCollectionProduct) is a bare join row with no
 *     fields of its own beyond sortOrder — never fetched directly by
 *     the frontend, only through the collection's product list.
 *   - imageUrl is a plain URL string (zod .url() on the backend) — the
 *     collections module has no dedicated multipart upload endpoint of
 *     its own, unlike stores.api.ts's uploadLogo/uploadCover.
 */
import type { Product } from './product.types';

export interface StoreCollection {
  id: string;
  storeId: string;
  name: string;
  slug: string;
  description: string | null;
  imageUrl: string | null;
  sortOrder: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

/** GET /collections/me and GET /collections/store/:storeId — both
 * include each collection's product count (collections.repository.ts's
 * withProductCount include), so list rows don't need a second fetch. */
export type StoreCollectionWithCount = StoreCollection & {
  _count: { products: number };
};

// ── Payloads ─────────────────────────────────────────────────────

export interface CreateCollectionPayload {
  name: string;
  description?: string;
  imageUrl?: string;
}

export type UpdateCollectionPayload = Partial<{
  name: string;
  description: string | null;
  imageUrl: string | null;
  isActive: boolean;
}>;

/** PATCH /collections/reorder — the full set of the owner's collection
 * ids in their new display order (must match exactly, see
 * collections.service.ts's reorderCollections). */
export interface ReorderCollectionsPayload {
  orderedIds: string[];
}

/** GET /collections/:id/products — public storefront read. Backend
 * returns the raw Product[] (no store/effectivePrice join — that's a
 * products.api.ts concern), so this is `Product`, not `ProductWithStore`. */
export type CollectionProducts = Product[];
