/**
 * __tests__/components/SearchInput.test.tsx
 *
 * SearchInput (used on the /search results page) differs from the
 * layout SearchBar in one important way: it always navigates on
 * submit, even with an empty query — it just omits the `q` param in
 * that case, letting /search show unfiltered results. It also accepts
 * a defaultValue to prefill from the current URL's query string.
 * This file itself was previously missing entirely (a build-breaking
 * import with no matching component, per its own comment), so a
 * regression here would be a repeat of a real incident.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchInput } from '@/components/ads/SearchInput';
import { ROUTES } from '@/lib/constants';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('SearchInput', () => {
  beforeEach(() => {
    mockPush.mockClear();
  });

  it('prefills the input from defaultValue', () => {
    render(<SearchInput defaultValue="سيارة" />);
    expect(screen.getByLabelText('بحث')).toHaveValue('سيارة');
  });

  it('renders empty by default with no defaultValue', () => {
    render(<SearchInput />);
    expect(screen.getByLabelText('بحث')).toHaveValue('');
  });

  it('navigates to /search with an encoded q param on submit', async () => {
    render(<SearchInput />);

    await userEvent.type(screen.getByLabelText('بحث'), 'شقة للايجار');
    await userEvent.click(screen.getByRole('button', { name: 'بحث' }));

    expect(mockPush).toHaveBeenCalledWith(`${ROUTES.search}?q=${encodeURIComponent('شقة للايجار')}`);
  });

  it('navigates to /search with no query params when the input is empty (unlike SearchBar, which blocks empty submits)', async () => {
    render(<SearchInput />);

    await userEvent.click(screen.getByRole('button', { name: 'بحث' }));

    expect(mockPush).toHaveBeenCalledWith(ROUTES.search);
  });

  it('trims whitespace and omits the q param entirely if the trimmed value is empty', async () => {
    render(<SearchInput />);

    await userEvent.type(screen.getByLabelText('بحث'), '   ');
    await userEvent.click(screen.getByRole('button', { name: 'بحث' }));

    expect(mockPush).toHaveBeenCalledWith(ROUTES.search);
  });
});
