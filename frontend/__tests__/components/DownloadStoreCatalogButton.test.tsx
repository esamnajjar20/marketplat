/**
 * __tests__/components/DownloadStoreCatalogButton.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { DownloadStoreCatalogButton } from '@/components/stores/DownloadStoreCatalogButton';
import { productsApi } from '@/api/products.api';

vi.mock('@/api/products.api', () => ({
  productsApi: { getAll: vi.fn() },
}));
vi.mock('@/api/stores.api', () => ({
  storesApi: {
    getById: vi.fn(async () => ({ data: { data: null } })),
    getMyStore: vi.fn(),
  },
}));
vi.mock('@/lib/downloadStorage', () => ({
  recordCatalogDownload: vi.fn(async () => undefined),
  formatCatalogSize: (n: number) => `${n}B`,
  listCatalogDownloads: vi.fn(() => []),
}));

// URL.createObjectURL for download path
beforeEach(() => {
  if (!URL.createObjectURL) {
    URL.createObjectURL = vi.fn(() => 'blob:mock') as never;
  }
  if (!URL.revokeObjectURL) {
    URL.revokeObjectURL = vi.fn() as never;
  }
});

describe('DownloadStoreCatalogButton', () => {
  beforeEach(() => {
    vi.mocked(productsApi.getAll).mockReset();
  });

  it('renders offline-save button label', () => {
    render(
      <DownloadStoreCatalogButton storeId="s1" storeName="متجر الأمل" />,
    );
    expect(screen.getByRole('button', { name: /حفظ المتجر/ })).toBeInTheDocument();
  });

  it('fetches products when clicked', async () => {
    vi.mocked(productsApi.getAll).mockResolvedValue({
      data: {
        data: {
          items: [],
          meta: { hasNextPage: false },
        },
      },
    } as never);
    const user = setupUser();
    render(
      <DownloadStoreCatalogButton storeId="s1" storeName="متجر الأمل" />,
    );
    await user.click(screen.getByRole('button', { name: /حفظ المتجر/ }));
    await waitFor(() => {
      expect(productsApi.getAll).toHaveBeenCalled();
    });
  });

  it('shows alert path when products fetch fails', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(productsApi.getAll).mockRejectedValue(new Error('network'));
    const user = setupUser();
    render(
      <DownloadStoreCatalogButton storeId="s1" storeName="متجر الأمل" />,
    );
    await user.click(screen.getByRole('button', { name: /حفظ المتجر/ }));
    await waitFor(() => {
      expect(alertSpy).toHaveBeenCalled();
    });
    alertSpy.mockRestore();
  });
});
