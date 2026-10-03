import { createStoreTypeFieldSchema } from '../../src/modules/store-types/store-type-fields.validation';

describe('StoreType product fields', () => {
  it('accepts PRODUCT scope', () => {
    const result = createStoreTypeFieldSchema.safeParse({
      params: { storeTypeId: 'st_restaurant' },
      body: {
        key: 'spicy_level',
        labelAr: 'درجة الحدة',
        type: 'SELECT',
        scope: 'PRODUCT',
        options: [{ value: 'hot', labelAr: 'حار' }],
      },
    });
    expect(result.success).toBe(true);
  });

  it('defaults new fields to STORE scope', () => {
    const result = createStoreTypeFieldSchema.parse({
      params: { storeTypeId: 'st_restaurant' },
      body: { key: 'prep_time', labelAr: 'وقت التحضير', type: 'NUMBER' },
    });
    expect(result.body.scope).toBe('STORE');
  });

  it('keeps STORE and PRODUCT keys independently scoped', () => {
    const store = createStoreTypeFieldSchema.safeParse({
      params: { storeTypeId: 'st_restaurant' },
      body: { key: 'name', labelAr: 'اسم العرض', type: 'TEXT', scope: 'STORE' },
    });
    const product = createStoreTypeFieldSchema.safeParse({
      params: { storeTypeId: 'st_restaurant' },
      body: { key: 'name', labelAr: 'اسم الصنف', type: 'TEXT', scope: 'PRODUCT' },
    });
    expect(store.success).toBe(true);
    expect(product.success).toBe(true);
  });
});
