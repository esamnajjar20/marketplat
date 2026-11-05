/** Aggregate, viewer-independent statistics exposed by the public store stats endpoint. */
export interface PublicStoreSalesStats {
  storeId: string;
  storeName: string;
  storeSlug: string;
  totalSales: number;
  averageRating: number;
  reviewCount: number;
  verifiedSeller: boolean;
  lastSaleAt: string | null;
}
