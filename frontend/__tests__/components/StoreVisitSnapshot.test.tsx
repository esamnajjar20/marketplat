import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { StoreVisitSnapshot } from '@/components/stores/StoreVisitSnapshot';
import { saveVisitedPublicStore } from '@/lib/offlineVisitedPublicEntities';
import type { StoreWithSellerAndCounts } from '@/types/store.types';

vi.mock('@/lib/offlineVisitedPublicEntities', () => ({
  saveVisitedPublicStore: vi.fn(),
}));

describe('StoreVisitSnapshot', () => {
  beforeEach(() => vi.clearAllMocks());

  it('saves an active server-rendered store under the actual route lookup key', () => {
    const store = {
      id: 'store-uuid',
      slug: 'store-slug',
      status: 'ACTIVE',
    } as StoreWithSellerAndCounts;

    render(<StoreVisitSnapshot lookupKey="store-slug" store={store} />);

    expect(saveVisitedPublicStore).toHaveBeenCalledWith('store-slug', store);
  });

  it('does not save a non-active store as a public offline snapshot', () => {
    const store = {
      id: 'store-uuid',
      slug: 'store-slug',
      status: 'BLOCKED',
    } as unknown as StoreWithSellerAndCounts;

    render(<StoreVisitSnapshot lookupKey="store-slug" store={store} />);

    expect(saveVisitedPublicStore).not.toHaveBeenCalled();
  });
});
