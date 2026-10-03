import { describe, expect, it } from 'vitest';
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
});
