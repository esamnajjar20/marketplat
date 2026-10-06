/**
 * __tests__/components/CreateAdGate.test.tsx
 *
 * Previously uncovered. Gates ad creation behind having a SellerProfile,
 * checked client-side before the heavier CreateAdForm (multi-field,
 * image upload) ever mounts. The component's own comment flags this
 * explicitly as a spot to keep in sync with the backend's
 * ensureSellerProfileForAdCreation check — a regression here either
 * strands every seller behind a false gate, or (worse) lets non-sellers
 * through to a form that only fails after they've filled it in.
 *
 * Unlike CreateProductGate/CreateServiceListingGate, this one does not
 * go through the shared RequireProfileGate — it has its own inline
 * loading/error/empty branches, so it needs its own coverage rather
 * than inheriting RequireProfileGate's.
 *
 * Coverage:
 *  - Loading: spinner only, no form, no CTA
 *  - Confirmed 404 (real "no profile") or no data: EmptyState CTA
 *    linking to settings/seller with ?from=/ads/create so
 *    BecomeSellerCard can send the user back
 *  - Profile present: renders CreateAdForm, not the CTA
 *  - a non-404 error (offline with no cached
 *    profile yet, 5xx, etc.) shows a retry state instead of the
 *    "create a seller profile" CTA — previously any error was read as
 *    "no profile", wrongly telling an existing seller to create one
 *    just because their first-ever load of this query happened offline
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreateAdGate } from '@/components/ads/CreateAdGate';
import { useMySellerProfile } from '@/hooks/queries/useSellers';

vi.mock('@/hooks/queries/useSellers', () => ({
  useMySellerProfile: vi.fn(),
}));

vi.mock('@/components/ads/CreateAdForm', () => ({
  CreateAdForm: () => <div>CreateAdForm</div>,
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

function mockProfile(state: {
  data?: unknown;
  isLoading?: boolean;
  isError?: boolean;
  error?: unknown;
  refetch?: () => void;
}) {
  (useMySellerProfile as ReturnType<typeof vi.fn>).mockReturnValue({
    data: undefined,
    isLoading: false,
    isError: false,
    ...state,
  });
}

describe('CreateAdGate', () => {
  it('shows a loading spinner and no form/CTA while the profile query is loading', () => {
    mockProfile({ isLoading: true });
    render(<CreateAdGate />);

    expect(screen.getByRole('status')).toBeInTheDocument();
    expect(screen.queryByText('CreateAdForm')).not.toBeInTheDocument();
    expect(screen.queryByText('أنشئ ملف البائع أولاً')).not.toBeInTheDocument();
  });

  it('shows the "create seller profile" CTA on a confirmed 404', () => {
    mockProfile({ isError: true, error: { statusCode: 404 } });
    render(<CreateAdGate />);

    expect(screen.getByText('أنشئ ملف البائع أولاً')).toBeInTheDocument();
    expect(screen.queryByText('CreateAdForm')).not.toBeInTheDocument();
  });

  it('FIX OFFLINE-GATE-404-01: shows a retry state (not the "create profile" CTA) on a non-404 error', () => {
    mockProfile({ isError: true, error: { statusCode: 0 }, refetch: vi.fn() });
    render(<CreateAdGate />);

    expect(screen.queryByText('أنشئ ملف البائع أولاً')).not.toBeInTheDocument();
    expect(screen.queryByText('CreateAdForm')).not.toBeInTheDocument();
    expect(screen.getByText('إعادة المحاولة')).toBeInTheDocument();
  });

  it('shows the CTA when the query resolves with no profile', () => {
    mockProfile({ data: undefined, isError: false });
    render(<CreateAdGate />);

    expect(screen.getByText('أنشئ ملف البائع أولاً')).toBeInTheDocument();
  });

  it('CTA link carries ?from=/ads/create so the user returns here after setup', () => {
    mockProfile({ isError: true, error: { statusCode: 404 } });
    render(<CreateAdGate />);

    const link = screen.getByRole('link', { name: 'إنشاء ملف البائع' });
    expect(link.getAttribute('href')).toBe(
      `/settings/seller?from=${encodeURIComponent('/ads/create')}`,
    );
  });

  it('renders CreateAdForm (not the CTA) once a seller profile exists', () => {
    mockProfile({ data: { id: 'sp-1' } });
    render(<CreateAdGate />);

    expect(screen.getByText('CreateAdForm')).toBeInTheDocument();
    expect(screen.queryByText('أنشئ ملف البائع أولاً')).not.toBeInTheDocument();
  });
});
