/**
 * DashboardStats — ads + messages; store/service only as shortcut links.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { DashboardStats } from '@/components/profile/DashboardStats';
import { useMyAdStats } from '@/hooks/queries/useAds';
import { useMyConversations } from '@/hooks/queries/useConversations';
import { useMyStore } from '@/hooks/queries/useStores';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';

vi.mock('@/hooks/queries/useAds', () => ({ useMyAdStats: vi.fn() }));
vi.mock('@/hooks/queries/useConversations', () => ({ useMyConversations: vi.fn() }));
vi.mock('@/hooks/queries/useStores', () => ({ useMyStore: vi.fn() }));
vi.mock('@/hooks/queries/useServiceProviders', () => ({ useMyServiceProvider: vi.fn() }));

const mockUseMyAdStats = vi.mocked(useMyAdStats);
const mockUseMyConversations = vi.mocked(useMyConversations);
const mockUseMyStore = vi.mocked(useMyStore);
const mockUseMyServiceProvider = vi.mocked(useMyServiceProvider);

beforeEach(() => {
  mockUseMyConversations.mockReturnValue({ data: { items: [] }, isLoading: false } as never);
  mockUseMyStore.mockReturnValue({ data: undefined, isSuccess: false } as never);
  mockUseMyServiceProvider.mockReturnValue({ data: undefined, isSuccess: false } as never);
});

describe('DashboardStats', () => {
  it('shows a loading spinner while stats are loading', () => {
    mockUseMyAdStats.mockReturnValue({
      data: undefined,
      isLoading: true,
      isError: false,
      refetch: vi.fn(),
    } as never);
    const { container } = render(<DashboardStats />);
    expect(container.querySelector('.py-8')).toBeInTheDocument();
    expect(screen.queryByText('الإعلانات النشطة')).not.toBeInTheDocument();
  });

  it('shows an error state with retry when the stats query fails', () => {
    const refetch = vi.fn();
    mockUseMyAdStats.mockReturnValue({
      data: undefined,
      isLoading: false,
      isError: true,
      refetch,
    } as never);
    render(<DashboardStats />);
    expect(screen.getByText('حدث خطأ أثناء تحميل الإحصائيات')).toBeInTheDocument();
    fireEvent.click(screen.getByText('إعادة المحاولة'));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it('renders ad stat cards from the API response', () => {
    mockUseMyAdStats.mockReturnValue({
      data: { activeAds: 4, soldAds: 2, totalViews: 137, favoritesCount: 9 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    render(<DashboardStats />);
    expect(screen.getByText('الإعلانات النشطة').closest('a,div')).toHaveTextContent(
      (4).toLocaleString('ar'),
    );
    expect(screen.getByText('إجمالي المشاهدات').closest('a,div')).toHaveTextContent(
      (137).toLocaleString('ar'),
    );
  });

  it('shows store/service shortcut links without duplicating KPI grids', () => {
    mockUseMyAdStats.mockReturnValue({
      data: { activeAds: 0, soldAds: 0, totalViews: 0, favoritesCount: 0 },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    } as never);
    mockUseMyStore.mockReturnValue({ data: { id: 's1', name: 'متجر' }, isSuccess: true } as never);
    mockUseMyServiceProvider.mockReturnValue({
      data: { id: 'p1', businessName: 'خدمة' },
      isSuccess: true,
    } as never);

    render(<DashboardStats />);
    expect(screen.getByText('لوحة المتجر')).toBeInTheDocument();
    expect(screen.getByText('لوحة الخدمات')).toBeInTheDocument();
    expect(screen.queryByText('مشاهدات المتجر')).not.toBeInTheDocument();
    expect(screen.queryByText('خدمات نشطة')).not.toBeInTheDocument();
  });
});
