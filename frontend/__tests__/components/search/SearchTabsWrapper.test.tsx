/**
 * __tests__/components/search/SearchTabsWrapper.test.tsx
 *
 * Covers components/search/SearchTabsWrapper.tsx — the URL-binding
 * layer around the presentational SearchTabs:
 *   - reads `type` from the URL, defaulting to 'all'.
 *   - changing to 'all' deletes the `type` param instead of writing it.
 *   - changing to any other type sets it.
 *   - categoryId and page are always dropped on a type change.
 *   - other unrelated params (q, city) are preserved.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { SearchTabsWrapper } from '@/components/search/SearchTabsWrapper';
import { ROUTES } from '@/lib/constants';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush, replace: vi.fn(), prefetch: vi.fn(), back: vi.fn() }),
  useSearchParams: () => mockSearchParams,
}));

describe('SearchTabsWrapper', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  it('defaults the active tab to "all" when no type param is present', () => {
    render(<SearchTabsWrapper />);
    expect(screen.getByRole('tab', { name: 'الكل' })).toHaveAttribute('aria-selected', 'true');
  });

  it('reflects the type already on the URL', () => {
    mockSearchParams = new URLSearchParams({ type: 'services' });
    render(<SearchTabsWrapper />);
    expect(screen.getByRole('tab', { name: 'الخدمات' })).toHaveAttribute('aria-selected', 'true');
  });

  it('sets the type param and drops categoryId/page when switching to a non-all tab', async () => {
    mockSearchParams = new URLSearchParams({ categoryId: 'cat-1', page: '2', q: 'هاتف' });
    const user = setupUser();
    render(<SearchTabsWrapper />);

    await user.click(screen.getByRole('tab', { name: 'المنتجات' }));

    const url = mockPush.mock.calls[0][0] as string;
    expect(url.startsWith(ROUTES.search)).toBe(true);
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.get('type')).toBe('products');
    expect(params.has('categoryId')).toBe(false);
    expect(params.has('page')).toBe(false);
    expect(params.get('q')).toBe('هاتف');
  });

  it('deletes the type param (rather than setting type=all) when switching back to "الكل"', async () => {
    mockSearchParams = new URLSearchParams({ type: 'stores', categoryId: 'cat-1' });
    const user = setupUser();
    render(<SearchTabsWrapper />);

    await user.click(screen.getByRole('tab', { name: 'الكل' }));

    const url = mockPush.mock.calls[0][0] as string;
    const params = new URLSearchParams(url.split('?')[1]);
    expect(params.has('type')).toBe(false);
    expect(params.has('categoryId')).toBe(false);
  });
});
