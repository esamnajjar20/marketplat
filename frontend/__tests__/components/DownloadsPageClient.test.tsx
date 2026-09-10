/**
 * __tests__/components/DownloadsPageClient.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { DownloadsPageClient } from '@/components/downloads/DownloadsPageClient';
import {
  listCatalogDownloads,
  removeCatalogDownload,
  clearCatalogDownloads,
  openCatalogOffline,
  type CatalogDownloadRecord,
} from '@/lib/downloadStorage';
import { toast } from 'sonner';

vi.mock('@/lib/downloadStorage', () => ({
  listCatalogDownloads: vi.fn(() => []),
  removeCatalogDownload: vi.fn(async () => undefined),
  clearCatalogDownloads: vi.fn(),
  openCatalogOffline: vi.fn(async () => true),
  formatCatalogSize: vi.fn((bytes: number) => `${bytes} B`),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const sample: CatalogDownloadRecord = {
  id: 'dl-1',
  storeId: 'store-1',
  storeName: 'متجر الأمل',
  productCount: 12,
  fileName: 'catalog.html',
  downloadedAt: '2026-01-15T10:00:00.000Z',
  hasOfflineBody: true,
  sizeBytes: 4096,
};

function mockList(items: CatalogDownloadRecord[] = [sample]) {
  // Synchronous — matches real listCatalogDownloads()
  vi.mocked(listCatalogDownloads).mockReturnValue(items);
}

describe('DownloadsPageClient', () => {
  beforeEach(() => {
    vi.mocked(listCatalogDownloads).mockReset();
    vi.mocked(removeCatalogDownload).mockReset();
    vi.mocked(clearCatalogDownloads).mockReset();
    vi.mocked(openCatalogOffline).mockReset();
    vi.mocked(toast.error).mockReset();
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    mockList();
  });

  it('renders downloaded catalog entries', async () => {
    render(<DownloadsPageClient />);

    await waitFor(() => {
      expect(screen.getByText('متجر الأمل')).toBeInTheDocument();
    });
    expect(screen.getByText(/12 منتج/)).toBeInTheDocument();
    expect(screen.getByText(/catalog\.html/)).toBeInTheDocument();
  });

  it('shows empty state when there are no downloads', async () => {
    mockList([]);
    render(<DownloadsPageClient />);

    await waitFor(() => {
      expect(screen.getByText(/لا توجد تنزيلات/)).toBeInTheDocument();
    });
    expect(screen.queryByText('متجر الأمل')).not.toBeInTheDocument();
  });

  it('opens offline catalog and shows error toast on failure', async () => {
    const user = setupUser();
    vi.mocked(openCatalogOffline).mockResolvedValue(false);
    render(<DownloadsPageClient />);

    await waitFor(() => expect(screen.getByText('متجر الأمل')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /فتح دون نت/ }));
    expect(openCatalogOffline).toHaveBeenCalledWith('dl-1');
    expect(toast.error).toHaveBeenCalled();
  });

  it('removes a download and refreshes the list', async () => {
    const user = setupUser();
    vi.mocked(removeCatalogDownload).mockResolvedValue(undefined);
    vi.mocked(listCatalogDownloads)
      .mockReturnValueOnce([sample])
      .mockReturnValueOnce([]);

    render(<DownloadsPageClient />);
    await waitFor(() => expect(screen.getByText('متجر الأمل')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /إزالة من المحفوظات/ }));
    expect(removeCatalogDownload).toHaveBeenCalledWith('dl-1');
  });

  it('clears all downloads from history', async () => {
    const user = setupUser();
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(clearCatalogDownloads).mockReturnValue(undefined as never);
    vi.mocked(listCatalogDownloads)
      .mockReturnValueOnce([sample])
      .mockReturnValueOnce([]);

    render(<DownloadsPageClient />);
    await waitFor(() => expect(screen.getByText('متجر الأمل')).toBeInTheDocument());

    await user.click(screen.getByRole('button', { name: /مسح السجل/ }));
    expect(clearCatalogDownloads).toHaveBeenCalled();
  });

  it('shows store link only when online', async () => {
    Object.defineProperty(navigator, 'onLine', { value: true, configurable: true });
    render(<DownloadsPageClient />);
    await waitFor(() => expect(screen.getByText('متجر الأمل')).toBeInTheDocument());
    expect(screen.getByRole('link', { name: /المتجر/ })).toBeInTheDocument();
  });

  it('hides store link when offline', async () => {
    Object.defineProperty(navigator, 'onLine', { value: false, configurable: true });
    render(<DownloadsPageClient />);
    await waitFor(() => expect(screen.getByText('متجر الأمل')).toBeInTheDocument());
    expect(screen.queryByRole('link', { name: /المتجر/ })).not.toBeInTheDocument();
  });
});
