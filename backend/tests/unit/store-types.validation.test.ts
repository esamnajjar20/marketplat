import {
  storeTypeLabelsSchema,
  createStoreTypeSchema,
  updateStoreTypeSchema,
  updateStoreTypeStatusSchema,
} from '../../src/modules/store-types/store-types.validation';

describe('store-types.validation', () => {
  const labels = {
    products: 'المنتجات',
    product: 'منتج',
    addProduct: 'أضف منتجًا',
    categories: 'التصنيفات',
  };

  it('accepts valid labels exactly', () => {
    expect(storeTypeLabelsSchema.parse(labels)).toEqual(labels);
  });

  it('rejects extra label keys', () => {
    expect(() => storeTypeLabelsSchema.parse({ ...labels, extra: 'x' })).toThrow();
  });

  it('accepts a valid store type', () => {
    expect(() =>
      createStoreTypeSchema.parse({
        body: {
          slug: 'pharmacy',
          nameAr: 'صيدلية',
          icon: 'Pill',
          labels,
          freeProductLimit: 100,
          sortOrder: 1,
        },
      }),
    ).not.toThrow();
  });

  it('rejects an invalid slug', () => {
    expect(() =>
      createStoreTypeSchema.parse({
        body: { slug: 'Pharmacy!', nameAr: 'صيدلية', icon: 'Pill', labels },
      }),
    ).toThrow();
  });

  it('does not allow slug changes in the update schema', () => {
    expect(() =>
      updateStoreTypeSchema.parse({ params: { id: 'st_pharmacy' }, body: { slug: 'other' } }),
    ).toThrow();
  });

  it('validates activation status', () => {
    expect(() =>
      updateStoreTypeStatusSchema.parse({ params: { id: 'st_pharmacy' }, body: { isActive: false } }),
    ).not.toThrow();
  });
});
