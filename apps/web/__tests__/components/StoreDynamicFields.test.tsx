import { describe, expect, it } from 'vitest';
import { formatStoreFieldValue } from '@/components/stores/StoreDynamicFields';
import type { StoreTypeField } from '@/types/store.types';

const selectField: StoreTypeField = {
  id: 'f1', storeTypeId: 'st_restaurant', key: 'spicy_level', scope: 'PRODUCT',
  labelAr: 'درجة الحدة', type: 'SELECT', required: false, sortOrder: 1,
  options: [
    { value: 'mild', labelAr: 'خفيف' },
    { value: 'hot', labelAr: 'حار' },
  ],
};

describe('StoreDynamicFields', () => {
  it('formats select values using admin-defined labels', () => {
    expect(formatStoreFieldValue(selectField, 'hot')).toBe('حار');
  });

  it('formats booleans consistently', () => {
    const field = { ...selectField, type: 'BOOLEAN' as const };
    expect(formatStoreFieldValue(field, true)).toBe('نعم');
    expect(formatStoreFieldValue(field, false)).toBe('لا');
  });
});
