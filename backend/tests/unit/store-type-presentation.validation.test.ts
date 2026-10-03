import { createStoreTypeSchema, updateStoreTypeSchema } from '../../src/modules/store-types/store-types.validation';

describe('store type presentation validation', () => {
  const presentation = {
    card: { title: 'مطعم', subtitle: 'أطباق يومية', products: 'القائمة', details: 'التفاصيل', contact: 'التواصل', location: 'الموقع' },
    page: { title: 'مطعم', subtitle: 'أطباق يومية', products: 'القائمة', details: 'عن المطعم', contact: 'التواصل', location: 'الموقع' },
  };

  it('accepts admin-controlled card and page names', () => {
    const result = createStoreTypeSchema.parse({
      body: { slug: 'restaurant', nameAr: 'مطعم', icon: 'Utensils', labels: { products: 'القائمة', product: 'طبق', addProduct: 'أضف طبقًا', categories: 'الأقسام' }, presentation },
    });
    expect(result.body.presentation).toEqual(presentation);
  });

  it('rejects unknown presentation keys', () => {
    expect(() => updateStoreTypeSchema.parse({
      params: { id: 'st_restaurant' },
      body: { presentation: { ...presentation, extra: true } },
    })).toThrow();
  });
});
