import { createStoreTypeFieldSchema, updateStoreTypeFieldSchema } from '../../src/modules/store-types/store-type-fields.validation';

describe('store-type-fields.validation', () => {
  it('accepts text fields', () => {
    expect(() => createStoreTypeFieldSchema.parse({
      params: { storeTypeId: 'st_restaurant' },
      body: { key: 'prep_time', labelAr: 'وقت التحضير', type: 'TEXT', required: true },
    })).not.toThrow();
  });

  it('requires options for select fields', () => {
    expect(() => createStoreTypeFieldSchema.parse({
      params: { storeTypeId: 'st_restaurant' },
      body: { key: 'size', labelAr: 'الحجم', type: 'SELECT' },
    })).toThrow();
  });

  it('rejects options on non-select fields', () => {
    expect(() => createStoreTypeFieldSchema.parse({
      params: { storeTypeId: 'st_restaurant' },
      body: { key: 'prep_time', labelAr: 'وقت التحضير', type: 'NUMBER', options: [{ value: 'x', labelAr: 'X' }] },
    })).toThrow();
  });

  it('keeps the field key immutable on update', () => {
    expect(() => updateStoreTypeFieldSchema.parse({
      params: { storeTypeId: 'st_restaurant', fieldId: 'field_1' },
      body: { key: 'other_key' },
    })).toThrow();
  });
});
