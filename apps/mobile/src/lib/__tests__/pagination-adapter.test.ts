import { describe, expect, it } from 'vitest';
import { toPaginatedResponse } from '../pagination';

describe('toPaginatedResponse', () => {
  it('يحوّل نتيجة API إلى شكل usePaginatedList مع الحفاظ على العناصر والصفحات', () => {
    const items = [{ id: 'a' }, { id: 'b' }];
    expect(toPaginatedResponse({ items, page: 2, totalPages: 5, total: 41 })).toEqual({
      items,
      meta: { page: 2, totalPages: 5, total: 41 },
    });
  });

  it('total اختياري', () => {
    const result = toPaginatedResponse({ items: [], page: 1, totalPages: 1 });
    expect(result.meta).toEqual({ page: 1, totalPages: 1, total: undefined });
  });
});
