/**
 * __tests__/unit/lib/offlineDraftResume.test.ts
 *
 * تغطية دوال الاستئناف النقية + دورة حياة active id (FIX RESUME-LEAK-01).
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  resumeHrefForDraft,
  adFieldsFromDraftPayload,
  productFieldsFromDraftPayload,
  serviceFieldsFromDraftPayload,
  setActiveOfflineDraftId,
  getActiveOfflineDraftId,
  clearActiveOfflineDraftId,
} from '@/lib/offlineDraftResume';
import type { AdDraft } from '@/lib/offlineAdDrafts';

function draft(partial: Partial<AdDraft> & Pick<AdDraft, 'id' | 'mode' | 'payload'>): AdDraft {
  return {
    status: 'pending_sync',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...partial,
  };
}

describe('resumeHrefForDraft', () => {
  it('routes ad create/edit', () => {
    expect(resumeHrefForDraft(draft({ id: 'd1', mode: 'create', payload: { title: 't', description: '' } }))).toBe(
      '/ads/create?draftId=d1',
    );
    expect(
      resumeHrefForDraft(
        draft({ id: 'd2', mode: 'edit', remoteAdId: 'ad-9', payload: { title: 't', description: '' } }),
      ),
    ).toBe('/my-ads/ad-9/edit?draftId=d2');
  });

  it('routes product create/edit', () => {
    expect(
      resumeHrefForDraft(
        draft({
          id: 'p1',
          mode: 'create',
          kind: 'product',
          payload: { title: 'n', description: '' },
        }),
      ),
    ).toBe('/my-store/products/new?draftId=p1');
    expect(
      resumeHrefForDraft(
        draft({
          id: 'p2',
          mode: 'edit',
          kind: 'product',
          remoteAdId: 'prod-1',
          payload: { title: 'n', description: '' },
        }),
      ),
    ).toBe('/my-store/products/prod-1/edit?draftId=p2');
  });

  it('routes service create/edit', () => {
    expect(
      resumeHrefForDraft(
        draft({
          id: 's1',
          mode: 'create',
          kind: 'service',
          payload: { title: 't', description: '' },
        }),
      ),
    ).toBe('/my-services/new?draftId=s1');
    expect(
      resumeHrefForDraft(
        draft({
          id: 's2',
          mode: 'edit',
          kind: 'service',
          remoteAdId: 'svc-1',
          payload: { title: 't', description: '' },
        }),
      ),
    ).toBe('/my-services/svc-1/edit?draftId=s2');
  });

  it('treats missing kind as ad', () => {
    expect(
      resumeHrefForDraft(draft({ id: 'legacy', mode: 'create', payload: { title: 'x', description: '' } })),
    ).toContain('/ads/create');
  });
});

describe('payload field mappers', () => {
  it('adFieldsFromDraftPayload maps core text fields + isNegotiable', () => {
    expect(
      adFieldsFromDraftPayload({
        title: 'عنوان',
        description: 'وصف',
        price: 10,
        condition: 'NEW',
        city: 'دمشق',
        categoryId: 'c1',
        isNegotiable: true,
      }),
    ).toEqual({
      title: 'عنوان',
      description: 'وصف',
      price: '10',
      condition: 'NEW',
      city: 'دمشق',
      categoryId: 'c1',
      isNegotiable: true,
    });
    expect(adFieldsFromDraftPayload({ title: 'x', description: '' }).isNegotiable).toBe(false);
  });

  it('productFieldsFromDraftPayload prefers name then title', () => {
    const withName = productFieldsFromDraftPayload({
      title: 'من العنوان',
      name: 'اسم المنتج',
      description: 'د',
      price: 5,
    });
    expect(withName.name).toBe('اسم المنتج');
    expect(withName.price).toBe('5');
    // title used when name absent
    expect(productFieldsFromDraftPayload({ title: 'فقط عنوان', description: '' }).name).toBe('فقط عنوان');
  });

  it('serviceFieldsFromDraftPayload maps pricing and location', () => {
    expect(
      serviceFieldsFromDraftPayload({
        title: 'خدمة',
        description: 'د',
        pricingType: 'FIXED',
        price: 20,
        serviceLocation: 'REMOTE',
        durationEstimate: 'ساعة',
        categoryId: 'sc1',
      }),
    ).toEqual({
      categoryId: 'sc1',
      title: 'خدمة',
      description: 'د',
      pricingType: 'FIXED',
      price: '20',
      durationEstimate: 'ساعة',
      serviceLocation: 'REMOTE',
    });
  });
});

describe('active offline draft id (FIX RESUME-LEAK-01)', () => {
  const store = new Map<string, string>();

  beforeEach(() => {
    store.clear();
    vi.stubGlobal('sessionStorage', {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
      removeItem: (k: string) => {
        store.delete(k);
      },
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('set / get / clear round-trip', () => {
    expect(getActiveOfflineDraftId()).toBeNull();
    setActiveOfflineDraftId('draft_abc');
    expect(getActiveOfflineDraftId()).toBe('draft_abc');
    clearActiveOfflineDraftId();
    expect(getActiveOfflineDraftId()).toBeNull();
  });

  it('setActiveOfflineDraftId(null) clears like clearActiveOfflineDraftId', () => {
    setActiveOfflineDraftId('x');
    setActiveOfflineDraftId(null);
    expect(getActiveOfflineDraftId()).toBeNull();
  });

  it('simulates resume-then-cancel-then-other-create: cleared id must not leak', () => {
    // user resumed ad draft A
    setActiveOfflineDraftId('ad-draft-A');
    expect(getActiveOfflineDraftId()).toBe('ad-draft-A');
    // user cancels form (forms call clearActiveOfflineDraftId)
    clearActiveOfflineDraftId();
    // later product create offline path reads active id
    expect(getActiveOfflineDraftId()).toBeNull();
  });
});
