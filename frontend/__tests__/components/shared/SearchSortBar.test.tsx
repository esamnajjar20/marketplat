/**
 * __tests__/components/shared/SearchSortBar.test.tsx
 *
 * Covers components/shared/SearchSortBar.tsx — the shared sort control
 * extracted out of SearchFilters/StoresFilters (audit item #8, FIX
 * P2-08). Two independent modes:
 *   - 'single': one URL param carries the whole value (unified search's
 *     `sort`).
 *   - 'combined': sortBy + sortOrder as two separate params (ads/stores).
 * Both must: read their current value from the URL (falling back to the
 * configured default), push the new value(s) on selection, always drop
 * `page`, and push relative to the given `basePath` (not a hardcoded
 * route) — the ads category-page caller depends on this to stay on the
 * current pathname instead of redirecting to /search.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { SearchSortBar } from '@/components/shared/SearchSortBar';

const mockPush = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
  useSearchParams: () => mockSearchParams,
}));

function paramsFromPush(callIndex = 0) {
  const url = mockPush.mock.calls[callIndex][0] as string;
  return new URLSearchParams(url.split('?')[1]);
}

describe('SearchSortBar', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParams = new URLSearchParams();
  });

  describe('single mode', () => {
    const options = [
      { value: 'relevance', label: 'الأكثر تطابقاً' },
      { value: 'newest', label: 'الأحدث' },
      { value: 'rating', label: 'الأعلى تقييماً' },
    ] as const;

    it('defaults to defaultValue when the param is not in the URL', () => {
      render(
        <SearchSortBar
          basePath="/search"
          config={{ mode: 'single', paramKey: 'sort', defaultValue: 'relevance', options }}
        />,
      );
      expect(screen.getByText('الأكثر تطابقاً')).toBeInTheDocument();
    });

    it('reads the current value from the URL', () => {
      mockSearchParams = new URLSearchParams({ sort: 'newest' });
      render(
        <SearchSortBar
          basePath="/search"
          config={{ mode: 'single', paramKey: 'sort', defaultValue: 'relevance', options }}
        />,
      );
      expect(screen.getByText('الأحدث')).toBeInTheDocument();
    });

    it('pushes the selected value under paramKey, dropping page, on the given basePath', async () => {
      mockSearchParams = new URLSearchParams({ page: '3' });
      const user = setupUser();
      render(
        <SearchSortBar
          basePath="/search"
          config={{ mode: 'single', paramKey: 'sort', defaultValue: 'relevance', options }}
        />,
      );

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'الأحدث' }));

      const [path] = mockPush.mock.calls[0][0].split('?');
      expect(path).toBe('/search');
      const params = paramsFromPush();
      expect(params.get('sort')).toBe('newest');
      expect(params.has('page')).toBe(false);
    });

    it('preserves other existing params when pushing', async () => {
      mockSearchParams = new URLSearchParams({ q: 'هاتف', city: 'غزة' });
      const user = setupUser();
      render(
        <SearchSortBar
          basePath="/search"
          config={{ mode: 'single', paramKey: 'sort', defaultValue: 'relevance', options }}
        />,
      );

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'الأحدث' }));

      const params = paramsFromPush();
      expect(params.get('q')).toBe('هاتف');
      expect(params.get('city')).toBe('غزة');
    });

    it('pushes relative to a non-/search basePath (category-page style)', async () => {
      const user = setupUser();
      render(
        <SearchSortBar
          basePath="/categories/electronics"
          config={{ mode: 'single', paramKey: 'sort', defaultValue: 'relevance', options }}
        />,
      );

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'الأحدث' }));

      const [path] = mockPush.mock.calls[0][0].split('?');
      expect(path).toBe('/categories/electronics');
    });
  });

  describe('combined mode', () => {
    const options = [
      { label: 'الأحدث', sortBy: 'createdAt', sortOrder: 'desc' },
      { label: 'الأقدم', sortBy: 'createdAt', sortOrder: 'asc' },
      { label: 'السعر (أقل)', sortBy: 'price', sortOrder: 'asc' },
    ] as const;

    it('defaults to defaultSortBy_defaultSortOrder when params are absent', () => {
      render(
        <SearchSortBar
          basePath="/categories/electronics"
          config={{ mode: 'combined', options, defaultSortBy: 'createdAt', defaultSortOrder: 'desc' }}
        />,
      );
      expect(screen.getByText('الأحدث')).toBeInTheDocument();
    });

    it('reads sortBy/sortOrder from the URL', () => {
      mockSearchParams = new URLSearchParams({ sortBy: 'price', sortOrder: 'asc' });
      render(
        <SearchSortBar
          basePath="/categories/electronics"
          config={{ mode: 'combined', options, defaultSortBy: 'createdAt', defaultSortOrder: 'desc' }}
        />,
      );
      expect(screen.getByText('السعر (أقل)')).toBeInTheDocument();
    });

    it('pushes both sortBy and sortOrder, dropping page', async () => {
      mockSearchParams = new URLSearchParams({ page: '2' });
      const user = setupUser();
      render(
        <SearchSortBar
          basePath="/categories/electronics"
          config={{ mode: 'combined', options, defaultSortBy: 'createdAt', defaultSortOrder: 'desc' }}
        />,
      );

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'السعر (أقل)' }));

      const params = paramsFromPush();
      expect(params.get('sortBy')).toBe('price');
      expect(params.get('sortOrder')).toBe('asc');
      expect(params.has('page')).toBe(false);
    });

    it('pushes relative to the given basePath, not a hardcoded route', async () => {
      const user = setupUser();
      render(
        <SearchSortBar
          basePath="/stores"
          config={{ mode: 'combined', options, defaultSortBy: 'createdAt', defaultSortOrder: 'desc' }}
        />,
      );

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'السعر (أقل)' }));

      const [path] = mockPush.mock.calls[0][0].split('?');
      expect(path).toBe('/stores');
    });

    it('supports custom sortByKey/sortOrderKey param names', async () => {
      const user = setupUser();
      render(
        <SearchSortBar
          basePath="/stores"
          config={{
            mode: 'combined',
            options,
            defaultSortBy: 'createdAt',
            defaultSortOrder: 'desc',
            sortByKey: 'orderBy',
            sortOrderKey: 'direction',
          }}
        />,
      );

      await user.click(screen.getByRole('combobox'));
      await user.click(await screen.findByRole('option', { name: 'السعر (أقل)' }));

      const params = paramsFromPush();
      expect(params.get('orderBy')).toBe('price');
      expect(params.get('direction')).toBe('asc');
      expect(params.has('sortBy')).toBe(false);
    });
  });
});
