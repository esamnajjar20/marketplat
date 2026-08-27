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
import type { SellerProfile } from './seller.types';

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
  stockQuantity?: number | null;
  status: ProductStatus;
  views: number;
  createdAt: string;
  updatedAt: string;
}

/** Product card in browse/search results — includes store summary to avoid N+1 fetches. */
export type ProductWithStore = Product & {
  store: Pick<StoreDetails, 'id' | 'name' | 'logoUrl' | 'city' | 'status'>;
  /**
   * PROMO-1: computed by backend's promotionsService.getEffectivePrice —
   * an ACTIVE-and-in-window Promotion always wins here over the static
   * discountPrice field above; discountPrice is only reflected in
   * effectivePrice as a fallback when no live Promotion exists. UI
   * components should read discountPrice/discountPercentage from here,
   * not from the raw Product.discountPrice field, so they automatically
   * pick up scheduled/expiring promotions without extra plumbing.
   */
  effectivePrice: EffectivePrice;
};

/** GET /products/:id — public detail, includes full store + owning seller
 * (backend products.repository productWithRelations includes
 * store.sellerProfile — needed for contact/message without a second fetch). */
export type ProductWithFullStore = Product & {
  store: StoreDetails & {
    sellerProfile: Pick<SellerProfile, 'id' | 'userId' | 'verified' | 'averageRating' | 'totalRatings'>;
  };
  category: Pick<ProductCategory, 'id' | 'name' | 'nameAr' | 'slug'>;
  effectivePrice: EffectivePrice;
};

/**
 * PROMO-1: the resolved "what does this product cost right now" shape —
 * see products.service.ts's getProductById/getProducts on the backend.
 * price/originalPrice are always the same value (Product.price,
 * unchanged); discountPrice/discountPercentage are null when nothing
 * discounts this product at all.
 */
export interface EffectivePrice {
  price: number;
  originalPrice: number;
  discountPrice: number | null;
  discountPercentage: number | null;
  hasActivePromotion: boolean;
  activePromotionId: string | null;
}

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
  stockQuantity?: number;
  images: File[];
}

/**
 * PATCH /products/:id — JSON, not multipart. The backend's update
 * schema has no images field — images are only ever mutated through
 * the dedicated POST/DELETE /products/:id/images endpoints (Gap #3
 * fix), never through this general PATCH, same convention as ads.
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
  stockQuantity?: number | null;
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
  /**
   * PROMO-1 (Phase 10): true restricts results to products carrying a
   * live (SCHEDULED or ACTIVE) Promotion — see backend's
   * products.validation.ts getProductsSchema for the exact semantics
   * and its known lazy-status staleness window.
   */
  hasPromotion?: boolean;
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
