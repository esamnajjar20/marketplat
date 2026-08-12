/**
 * __tests__/components/CreateProductGate.test.tsx
 *
 * Previously uncovered. Gates product creation behind store ownership
 * (useMyStore) — mirrors CreateAdGate/CreateServiceListingGate. All of
 * the actual loading/error/empty/present branching lives in the shared
 * RequireProfileGate (separately covered), so this test only needs to
 * confirm the wiring: the right query hook is called, the right
 * setup/from/copy props reach RequireProfileGate, and ProductForm mounts
 * once a store exists. A regression here (e.g. wrong `from` or
 * `setupHref`) would silently send users to the wrong place after setup,
 * or let a storeless user reach a form that only fails on submit.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreateProductGate } from '@/components/stores/CreateProductGate';
import { useMyStore } from '@/hooks/queries/useStores';

vi.mock('@/hooks/queries/useStores', () => ({
  useMyStore: vi.fn(),
}));

vi.mock('@/components/stores/ProductForm', () => ({
  ProductForm: ({ mode }: { mode: string }) => <div>ProductForm:{mode}</div>,
}));

vi.mock('next/link', () => ({
  default: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: React.ReactNode;
    [k: string]: unknown;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function mockStore(state: { data?: unknown; isLoading?: boolean; isError?: boolean }) {
  (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...state,
  });
}

describe('CreateProductGate', () => {
  it('calls useMyStore (not some other profile hook) to determine access', () => {
    mockStore({ isLoading: true });
    render(<CreateProductGate />);

    expect(useMyStore).toHaveBeenCalled();
  });

  it('shows the "open a store" CTA when there is no store yet', () => {
    mockStore({ data: undefined, isError: false });
    render(<CreateProductGate />);

    expect(screen.getByText('افتح متجرك أولاً')).toBeInTheDocument();
    expect(screen.queryByText('ProductForm:create')).not.toBeInTheDocument();
  });

  it('CTA links to /my-store with ?from=/my-store/products/new', () => {
    mockStore({ isError: true });
    render(<CreateProductGate />);

    const link = screen.getByRole('link', { name: 'فتح متجر' });
    expect(link.getAttribute('href')).toBe(
      `/my-store?from=${encodeURIComponent('/my-store/products/new')}`,
    );
  });

  it('renders ProductForm in create mode once a store exists', () => {
    mockStore({ data: { id: 'store-1' } });
    render(<CreateProductGate />);

    expect(screen.getByText('ProductForm:create')).toBeInTheDocument();
    expect(screen.queryByText('افتح متجرك أولاً')).not.toBeInTheDocument();
  });
});
