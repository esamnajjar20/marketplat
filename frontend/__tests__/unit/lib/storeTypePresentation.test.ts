import { DEFAULT_STORE_TYPE_PRESENTATION, getStoreTypePresentation } from '@/types/store.types';

describe('store type presentation fallbacks', () => {
  it('falls back safely for legacy store responses', () => {
    expect(getStoreTypePresentation(null)).toEqual(DEFAULT_STORE_TYPE_PRESENTATION);
  });

  it('merges admin-controlled presentation values with defaults', () => {
    const result = getStoreTypePresentation({
      presentation: {
        card: { ...DEFAULT_STORE_TYPE_PRESENTATION.card, title: 'مطعم' },
        page: { ...DEFAULT_STORE_TYPE_PRESENTATION.page, products: 'القائمة' },
      },
    });
    expect(result.card.title).toBe('مطعم');
    expect(result.page.products).toBe('القائمة');
  });
});
