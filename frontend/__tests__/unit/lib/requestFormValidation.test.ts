import { describe, expect, it } from 'vitest';
import { getFirstInvalidRequestField } from '@/lib/requestFormValidation';

describe('getFirstInvalidRequestField', () => {
  it('focuses the category before later required fields', () => {
    expect(getFirstInvalidRequestField({ categoryId: ' ', title: '', description: '' })).toBe('req-cat');
  });

  it('focuses the title when category exists but title is too short', () => {
    expect(getFirstInvalidRequestField({ categoryId: 'cat-1', title: 'abc', description: 'long enough details' })).toBe('req-title');
  });

  it('focuses the description after a valid title', () => {
    expect(getFirstInvalidRequestField({ categoryId: 'cat-1', title: 'عنوان صالح', description: 'قصير' })).toBe('req-desc');
  });

  it('returns null when all required fields are valid', () => {
    expect(getFirstInvalidRequestField({ categoryId: 'cat-1', title: 'عنوان صالح', description: 'تفاصيل كافية للطلب' })).toBeNull();
  });
});
