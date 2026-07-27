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

  it('trims leading/trailing whitespace before encoding the query', async () => {
    render(<SearchBar />);

    const input = screen.getByLabelText('ابحث في الإعلانات');
    await userEvent.type(input, '  شقة  ');
    await userEvent.click(screen.getByRole('button', { name: 'بحث' }));

    expect(mockPush).toHaveBeenCalledWith(`${ROUTES.search}?q=${encodeURIComponent('شقة')}`);
  });

  it('does not navigate when the query is empty', async () => {
    render(<SearchBar />);

    await userEvent.click(screen.getByRole('button', { name: 'بحث' }));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('does not navigate when the query is only whitespace', async () => {
    render(<SearchBar />);

    const input = screen.getByLabelText('ابحث في الإعلانات');
    await userEvent.type(input, '   ');
    await userEvent.click(screen.getByRole('button', { name: 'بحث' }));

    expect(mockPush).not.toHaveBeenCalled();
  });

  it('applies a custom className when provided', () => {
    const { container } = render(<SearchBar className="custom-class" />);
    expect(container.querySelector('form')).toHaveClass('custom-class');
  });
});
