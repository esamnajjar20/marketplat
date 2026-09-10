/**
 * __tests__/components/SavedOfflineAdsPageClient.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { SavedOfflineAdsPageClient } from '@/components/ads/SavedOfflineAdsPageClient';
import { listSavedOfflineAds, unsaveAdOffline } from '@/lib/offlineSavedAds';
import { toast } from 'sonner';

vi.mock('@/lib/offlineSavedAds', () => ({
  listSavedOfflineAds: vi.fn(() => []),
  unsaveAdOffline: vi.fn(async () => undefined),
}));

vi.mock('@/lib/formatters', () => ({
  formatPrice: (p: unknown) => `${p} ₪`,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/components/shared/ui/SafeImage', () => ({
  SafeImage: () => <img alt="" />,
}));

const sample = {
  id: 'ad-1',
  title: 'سيارة للبيع',
  price: 5000,
  city: 'غزة',
  thumbnail: null,
};

describe('SavedOfflineAdsPageClient', () => {
  beforeEach(() => {
    vi.mocked(listSavedOfflineAds).mockReturnValue([]);
    vi.mocked(unsaveAdOffline).mockReset();
    vi.mocked(toast.success).mockReset();
  });

  it('shows empty state when no offline ads', async () => {
    render(<SavedOfflineAdsPageClient />);
    await waitFor(() => {
      expect(screen.getByText(/لا توجد إعلانات محفوظة دون اتصال/)).toBeInTheDocument();
    });
  });

  it('lists saved offline ads', async () => {
    vi.mocked(listSavedOfflineAds).mockReturnValue([sample] as never);
    render(<SavedOfflineAdsPageClient />);
    await waitFor(() => {
      expect(screen.getByText('سيارة للبيع')).toBeInTheDocument();
    });
    expect(screen.getByText(/غزة/)).toBeInTheDocument();
  });

  it('removes an ad and refreshes', async () => {
    const user = setupUser();
    vi.mocked(listSavedOfflineAds)
      .mockReturnValueOnce([sample] as never)
      .mockReturnValueOnce([] as never);
    vi.mocked(unsaveAdOffline).mockResolvedValue(undefined as never);

    render(<SavedOfflineAdsPageClient />);
    await waitFor(() => expect(screen.getByText('سيارة للبيع')).toBeInTheDocument());

    await user.click(screen.getByLabelText(/إزالة من المحفوظات/));
    expect(unsaveAdOffline).toHaveBeenCalledWith('ad-1');
    expect(toast.success).toHaveBeenCalled();
  });
});
