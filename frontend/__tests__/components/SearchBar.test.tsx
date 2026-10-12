/**
 * __tests__/components/SearchBar.test.tsx
 *
 * SearchBar's real logic: controlled input state, submit navigates to
 * /search?q=<encoded query>, and empty/whitespace-only submissions are
 * a no-op (no navigation). Renders real Input/Button (shadcn
 * primitives) rather than mocking them — nothing here needs isolating
 * from those.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SearchBar } from '@/components/layout/SearchBar';
import { ROUTES } from '@/lib/constants';

const mockPush = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockPush }),
}));

describe('SearchBar', () => {
  beforeEach(() => {
    mockPush.mockClear();
    window.localStorage.clear();
  });

  it('navigates to /search with the encoded query on submit', async () => {
    render(<SearchBar />);

    const input = screen.getByLabelText('ابحث في الإعلانات');
    await userEvent.type(input, 'سيارة كورولا');
    await userEvent.click(screen.getByRole('button', { name: 'بحث' }));

    expect(mockPush).toHaveBeenCalledWith(
      `${ROUTES.search}?q=${encodeURIComponent('سيارة كورولا')}`,
    );
  });

  it('exposes suggestions as a controlled combobox for assistive technology', async () => {
    window.localStorage.setItem('marketplat:recent-searches-v2:guest', JSON.stringify([
      { query: 'سيارة كورولا', count: 1, lastUsedAt: new Date().toISOString() },
    ]));
    render(<SearchBar />);

    const input = screen.getByRole('combobox', { name: 'ابحث في الإعلانات' });
    expect(input).toHaveAttribute('aria-autocomplete', 'list');
    expect(input).toHaveAttribute('aria-expanded', 'false');
    const listId = input.getAttribute('aria-controls');
    expect(listId).toBeTruthy();

    await userEvent.type(input, 'سي');
    expect(input).toHaveAttribute('aria-expanded', 'true');
    expect(document.getElementById(listId!)).toHaveAttribute('role', 'listbox');
    expect(screen.getByRole('option', { name: /سيارة كورولا/ })).toBeInTheDocument();
  });

  it('trims leading/trailing whitespace before encoding the query', async () => {
    render(<SearchBar />);

    const input = screen.getByLabelText('ابحث في الإعلانات');
    await userEvent.type(input, '  شقة  ');
    await userEvent.click(screen.getByRole('button', { name: 'بحث' }));

    expect(mockPush).toHaveBeenCalledWith(`${ROUTES.search}?q=${encodeURIComponent('شقة')}`);
  });

  it('navigates to /search with no query param when the query is empty (FIX P1-5)', async () => {
    // FIX P1-5: an empty submit used to be blocked outright; it now
    // matches SearchInput's "browse everything" behavior and navigates
    // to /search with no `q` param, per the component's own comment.
    render(<SearchBar />);

    await userEvent.click(screen.getByRole('button', { name: 'بحث' }));

    expect(mockPush).toHaveBeenCalledWith(ROUTES.search);
  });

  it('navigates to /search with no query param when the query is only whitespace (FIX P1-5)', async () => {
    render(<SearchBar />);

    const input = screen.getByLabelText('ابحث في الإعلانات');
    await userEvent.type(input, '   ');
    await userEvent.click(screen.getByRole('button', { name: 'بحث' }));

    expect(mockPush).toHaveBeenCalledWith(ROUTES.search);
  });

  it('applies a custom className when provided', () => {
    const { container } = render(<SearchBar className="custom-class" />);
    expect(container.querySelector('form')).toHaveClass('custom-class');
  });
});
