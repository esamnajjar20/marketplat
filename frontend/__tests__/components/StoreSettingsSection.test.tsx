/**
 * __tests__/components/StoreSettingsSection.test.tsx
 *
 * Coverage targets (the important branching logic lives entirely in
 * this component, not in useMyStore — child components are mocked so
 * the test isolates the loading/error/404-vs-other-error/success
 * branches):
 *  - shows a spinner while loading
 *  - shows MyStoreCard with the fetched store when the query succeeds
 *  - shows BecomeStoreOwnerCard when the query 404s (no store yet)
 *  - shows BecomeStoreOwnerCard when the query succeeds but returns
 *    no store (falsy data, no error)
 *  - shows a distinct "failed to load, retry" state — NOT the
 *    create-a-store CTA — for any non-404 error (network/5xx), since
 *    conflating the two would hide a real outage behind a wrong CTA
 *  - the retry button in the non-404 error state calls refetch()
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { StoreSettingsSection } from '@/components/stores/StoreSettingsSection';
import { useMyStore } from '@/hooks/queries/useStores';

vi.mock('@/hooks/queries/useStores', () => ({
  useMyStore: vi.fn(),
}));

vi.mock('@/components/stores/MyStoreCard', () => ({
  MyStoreCard: ({ store }: { store: { name: string } }) => <div>MyStoreCard:{store.name}</div>,
}));

vi.mock('@/components/stores/BecomeStoreOwnerCard', () => ({
  BecomeStoreOwnerCard: () => <div>BecomeStoreOwnerCard</div>,
}));

beforeEach(() => vi.clearAllMocks());

describe('StoreSettingsSection', () => {
  it('shows a spinner while loading', () => {
    (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({ isLoading: true });
    const { container } = render(<StoreSettingsSection />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('shows MyStoreCard with the fetched store on success', () => {
    (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoading: false, isError: false, data: { id: 's-1', name: 'متجري' },
    });
    render(<StoreSettingsSection />);
    expect(screen.getByText('MyStoreCard:متجري')).toBeInTheDocument();
  });

  it('shows BecomeStoreOwnerCard on a 404 (no store yet)', () => {
    (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoading: false, isError: true, error: { statusCode: 404 }, data: undefined,
    });
    render(<StoreSettingsSection />);
    expect(screen.getByText('BecomeStoreOwnerCard')).toBeInTheDocument();
  });

  it('shows BecomeStoreOwnerCard when the query succeeds but data is falsy', () => {
    (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoading: false, isError: false, data: null,
    });
    render(<StoreSettingsSection />);
    expect(screen.getByText('BecomeStoreOwnerCard')).toBeInTheDocument();
  });

  it('shows a "failed to load" retry state (NOT the create CTA) for a non-404 error', () => {
    (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoading: false, isError: true, error: { statusCode: 500 }, data: undefined, refetch: vi.fn(),
    });
    render(<StoreSettingsSection />);
    expect(screen.getByText('تعذّر تحميل بيانات المتجر. يرجى المحاولة مرة أخرى.')).toBeInTheDocument();
    expect(screen.queryByText('BecomeStoreOwnerCard')).not.toBeInTheDocument();
  });

  it('treats a network error with no statusCode the same as a non-404 (shows retry, not the create CTA)', () => {
    (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoading: false, isError: true, error: null, data: undefined, refetch: vi.fn(),
    });
    render(<StoreSettingsSection />);
    expect(screen.getByText('تعذّر تحميل بيانات المتجر. يرجى المحاولة مرة أخرى.')).toBeInTheDocument();
  });

  it('calls refetch() when the retry button is clicked in the non-404 error state', async () => {
    const user = userEvent.setup();
    const refetch = vi.fn();
    (useMyStore as ReturnType<typeof vi.fn>).mockReturnValue({
      isLoading: false, isError: true, error: { statusCode: 500 }, data: undefined, refetch,
    });
    render(<StoreSettingsSection />);

    await user.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(refetch).toHaveBeenCalled();
  });
});
