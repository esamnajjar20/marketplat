/**
 * Product / product-category types — maps to backend's Product /
 * ProductCategory Prisma models. Verified directly against the
 * products + product-categories backend modules (*.controller.ts /
 * *.repository.ts / *.validation.ts / prisma/schema.prisma).
 *
 * A Product always belongs to a StoreDetails (never directly to a
 * user) — same one-hop-removed-from-User shape ServiceListing has via
 * ServiceProviderDetails. See store.types.ts for the store side.
 */
import type { StoreDetails } from './store.types';

export type ProductAvailability = 'IN_STOCK' | 'LIMITED' | 'OUT_OF_STOCK';
export type ProductStatus = 'ACTIVE' | 'PAUSED' | 'DELETED';

export interface ProductCategory {
  id: string;
  name: string;
  nameAr: string;
  slug: string;
  icon: string | null;
  parentId: string | null;
  isActive: boolean;
  createdAt: string;
  // Only present on the admin listing, same convention as
  // ServiceCategory.children/_count in service.types.ts.
  children?: ProductCategory[];
  _count?: { products: number };
}

export interface Product {
  id: string;
  storeId: string;
  categoryId: string;
  name: string;
  description: string;
  images: string[];
  /** Prisma Decimal(10,2) — string in JSON, same convention as Ad.price. */
  price: string;
  wholesalePrice: string | null;
  wholesaleMinQty: number | null;
  discountPrice: string | null;
  availability: ProductAvailability;
  status: ProductStatus;
  views: number;
  createdAt: string;
  updatedAt: string;
}

/** Product card in browse/search results — includes store summary to avoid N+1 fetches. */
export type ProductWithStore = Product & {
  store: Pick<StoreDetails, 'id' | 'name' | 'logoUrl' | 'city' | 'status'>;
};

/** GET /products/:id — public detail, includes full store context. */
export type ProductWithFullStore = Product & {
  store: StoreDetails;
  category: Pick<ProductCategory, 'id' | 'name' | 'nameAr' | 'slug'>;
};

// ── Payloads ─────────────────────────────────────────────────────

/**
 * POST /products (multipart/form-data — images come from files, not
 * this payload). wholesalePrice/wholesaleMinQty are a pair: the
 * backend's createProductSchema rejects one being set without the
 * other.
 */
export interface CreateProductPayload {
  categoryId: string;
  name: string;
  description: string;
  price: number;
  discountPrice?: number;
  wholesalePrice?: number;
  wholesaleMinQty?: number;
  availability?: ProductAvailability;
  images: File[];
}

/**
 * PATCH /products/:id — JSON, not multipart. The backend's update
 * schema has no images field — there is no image-replace endpoint for
 * products (same limitation as service listings; see
 * service.types.ts's UpdateServiceListingPayload comment).
 */
export interface UpdateProductPayload {
  categoryId?: string;
  name?: string;
  description?: string;
  price?: number;
  discountPrice?: number | null;
  wholesalePrice?: number | null;
  wholesaleMinQty?: number | null;
  availability?: ProductAvailability;
  status?: ProductStatus;
}

export type ProductSortField = 'createdAt' | 'price' | 'views';

export interface ProductsQuery {
  page?: number;
  limit?: number;
  categoryId?: string;
  storeId?: string;
  city?: string;
  availability?: ProductAvailability;
  minPrice?: number;
  maxPrice?: number;
  search?: string;
  sortBy?: ProductSortField;
  sortOrder?: 'asc' | 'desc';
  /** Used by my-products (GET /products/me); ignored by the public browse endpoint. */
  status?: ProductStatus;
}

// ── Product category payloads (admin) ───────────────────────────

export interface CreateProductCategoryPayload {
  name: string;
  nameAr: string;
  slug: string;
  icon?: string;
  parentId?: string;
}

export type UpdateProductCategoryPayload = Partial<CreateProductCategoryPayload> & {
  isActive?: boolean;
};
