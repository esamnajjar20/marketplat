import { describe, expect, it } from 'vitest';
import { getStoreTypeLabels } from '@/types/store.types';

describe('getStoreTypeLabels', () => {
  it('returns general defaults when storeType is missing', () => {
    expect(getStoreTypeLabels(undefined)).toEqual({
      products: 'المنتجات',
      product: 'منتج',
      addProduct: 'أضف منتجًا',
      categories: 'التصنيفات',
    });
  });

  it('preserves supplied labels', () => {
    expect(getStoreTypeLabels({
      labels: {
        products: 'القائمة',
        product: 'طبق',
        addProduct: 'أضف طبقًا',
        categories: 'الأقسام',
      },
    })).toEqual({
      products: 'القائمة',
      product: 'طبق',
      addProduct: 'أضف طبقًا',
      categories: 'الأقسام',
    });
  });
});
