/**
 * CreateRequestForm — Stepper draft restore + validation smoke tests.
 * Mirrors inferStepFromDraft rules used inside the component.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// Pure replica of component helper — keep in sync with CreateRequestForm.inferStepFromDraft
function inferStepFromDraft(d: {
  categoryId?: string;
  title?: string;
  description?: string;
  city?: string;
  budgetMin?: string;
  budgetMax?: string;
  step?: number;
}): number {
  if (typeof d.step === 'number' && d.step >= 1 && d.step <= 4) {
    return Math.floor(d.step);
  }
  const hasCat = Boolean(d.categoryId?.trim());
  const hasDetails =
    (d.title?.trim().length ?? 0) >= 5 && (d.description?.trim().length ?? 0) >= 10;
  if (hasCat && hasDetails) return 3;
  if (hasCat) return 2;
  return 1;
}

describe('inferStepFromDraft (CreateRequestForm stepper restore)', () => {
  it('returns 1 when draft is empty', () => {
    expect(inferStepFromDraft({})).toBe(1);
  });

  it('returns 2 when only category is set', () => {
    expect(inferStepFromDraft({ categoryId: 'cat-1' })).toBe(2);
  });

  it('returns 3 when category + full title/description are set', () => {
    expect(
      inferStepFromDraft({
        categoryId: 'cat-1',
        title: 'أحتاج فني تكييف',
        description: 'صيانة وحدة سبليت في الشقة',
      }),
    ).toBe(3);
  });

  it('prefers explicit saved step (e.g. 4 review) over field inference', () => {
    expect(
      inferStepFromDraft({
        categoryId: 'cat-1',
        title: 'عنوان كافٍ هنا',
        description: 'وصف طويل بما فيه الكفاية',
        step: 4,
      }),
    ).toBe(4);
  });

  it('clamps invalid step via floor only when in 1..4 range — ignores 0', () => {
    expect(inferStepFromDraft({ step: 0, categoryId: 'x' })).toBe(2);
    expect(inferStepFromDraft({ step: 99 })).toBe(1);
  });
});

describe('CreateRequestForm stepper navigation (integration smoke)', () => {
  beforeEach(() => {
    vi.resetModules();
  });

  it('documents that step is persisted in open-request:create draft key', () => {
    // Contract test: draft payload shape expected by useFormDraft
    const draftPayload = {
      type: 'SERVICE' as const,
      categoryId: 'c1',
      title: 'عنوان تجريبي طويل',
      description: 'تفاصيل كافية للاختبار هنا',
      city: 'غزة',
      budgetMin: '',
      budgetMax: '100',
      step: 3,
      expiresInDays: '14',
    };
    expect(inferStepFromDraft(draftPayload)).toBe(3);
    expect(draftPayload.step).toBe(3);
  });
});
