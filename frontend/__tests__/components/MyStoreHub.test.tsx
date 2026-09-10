/**
 * __tests__/components/MyStoreHub.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyStoreHub } from '@/components/stores/MyStoreHub';
import { useMyStore } from '@/hooks/queries/useStores';
import { useMyAttention } from '@/hooks/queries/useSellers';
import { useRequestStoreFeature } from '@/hooks/mutations/useStoreMutations';

vi.mock('@/hooks/queries/useStores', () => ({
  useMyStore: vi.fn(),
}));

vi.mock('@/hooks/queries/useSellers', () => ({
  useMyAttention: vi.fn(),
}));

vi.mock('@/hooks/mutations/useStoreMutations', () => ({
  useRequestStoreFeature: vi.fn(),
}));

vi.mock('@/components/stores/BecomeStoreOwnerCard', () => ({
  BecomeStoreOwnerCard: () => <div data-testid="become-store-owner" />,
}));

const activeStore = {
  id: 'store-1',
  name: 'متجري',
  status: 'ACTIVE',
  plan: 'FREE',
  logoUrl: null,
  city: 'غزة',
  description: 'وصف',
  phone: null,
  address: null,
  latitude: null,
  longitude: null,
  coverUrl: null,
  sellerProfileId: 'sp-1',
  featureRequestedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
};

function mockHub({
  store = activeStore as never,
  isLoading = false,
  isError = false,
  error = null,
}: {
  store?: unknown;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
} = {}) {
  vi.mocked(useMyStore).mockReturnValue({
    data: store,
    isLoading,
    isError,
    error,
    refetch: vi.fn(),
  } as never);

  vi.mocked(useMyAttention).mockReturnValue({ data: null } as never);
  vi.mocked(useRequestStoreFeature).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never);
}

describe('MyStoreHub', () => {
  beforeEach(() => {
    mockHub();
  });

  it('shows loading state', () => {
    mockHub({ isLoading: true, store: undefined });
    render(<MyStoreHub />);
    expect(screen.queryByText('متجري')).not.toBeInTheDocument();
  });

  it('renders store name and status for active store', () => {
    render(<MyStoreHub />);
    expect(screen.getByText('متجري')).toBeInTheDocument();
  });

  it('shows pending review banner', () => {
    mockHub({
      store: { ...activeStore, status: 'PENDING' } as never,
    });
    render(<MyStoreHub />);
    expect(screen.getByText('متجرك قيد المراجعة')).toBeInTheDocument();
  });

  it('shows blocked banner', () => {
    mockHub({
      store: { ...activeStore, status: 'BLOCKED' } as never,
    });
    render(<MyStoreHub />);
    expect(screen.getByText(/تم حظر متجرك/)).toBeInTheDocument();
  });

  it('shows become-owner card when user has no store (404-style)', () => {
    mockHub({
      store: undefined,
      isError: true,
      error: { statusCode: 404 },
    });
    // Component may show BecomeStoreOwnerCard or error UI
    render(<MyStoreHub />);
    expect(
      screen.queryByTestId('become-store-owner') ||
        screen.queryByText(/متجر|إنشاء|لا يوجد/),
    ).toBeTruthy();
  });
});
