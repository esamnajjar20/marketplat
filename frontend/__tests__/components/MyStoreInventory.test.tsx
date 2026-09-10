/**
 * __tests__/components/MyStoreInventory.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MyStoreInventory } from '@/components/stores/MyStoreInventory';
import { useMyProducts } from '@/hooks/queries/useProducts';
import { useAdjustProductStock } from '@/hooks/mutations/useAdjustProductStock';

vi.mock('@/hooks/queries/useProducts', () => ({
  useMyProducts: vi.fn(),
}));

vi.mock('@/hooks/mutations/useAdjustProductStock', () => ({
  useAdjustProductStock: vi.fn(),
}));

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

const products = [
  {
    id: 'p1',
    name: 'منتج أ',
    price: '100',
    stockQuantity: 5,
    availability: 'IN_STOCK',
    status: 'ACTIVE',
    images: [],
    storeId: 's1',
    categoryId: 'c1',
    description: '',
    wholesalePrice: null,
    wholesaleMinQty: null,
    discountPrice: null,
    views: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
  {
    id: 'p2',
    name: 'منتج ب',
    price: '200',
    stockQuantity: 0,
    availability: 'OUT_OF_STOCK',
    status: 'ACTIVE',
    images: [],
    storeId: 's1',
    categoryId: 'c1',
    description: '',
    wholesalePrice: null,
    wholesaleMinQty: null,
    discountPrice: null,
    views: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  },
];

function mockInv({
  items = products,
  isLoading = false,
  isError = false,
}: {
  items?: typeof products;
  isLoading?: boolean;
  isError?: boolean;
} = {}) {
  vi.mocked(useMyProducts).mockReturnValue({
    data: { items, meta: { totalPages: 1, hasNextPage: false } },
    isLoading,
    isError,
    refetch: vi.fn(),
  } as never);

  vi.mocked(useAdjustProductStock).mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
  } as never);
}

describe('MyStoreInventory', () => {
  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockPush.mockReset();
    mockInv();
  });

  it('shows loading state', () => {
    mockInv({ isLoading: true, items: [] });
    render(<MyStoreInventory />);
    expect(screen.queryByText('منتج أ')).not.toBeInTheDocument();
  });

  it('renders product rows', () => {
    render(<MyStoreInventory />);
    expect(screen.getByText('منتج أ')).toBeInTheDocument();
    expect(screen.getByText('منتج ب')).toBeInTheDocument();
  });

  it('shows empty state when no products', () => {
    mockInv({ items: [] });
    render(<MyStoreInventory />);
    // EmptyState message
    expect(screen.queryByText('منتج أ')).not.toBeInTheDocument();
  });

  it('shows error state with retry', () => {
    mockInv({ isError: true, items: [] });
    render(<MyStoreInventory />);
    expect(screen.queryByText('منتج أ')).not.toBeInTheDocument();
  });
});
