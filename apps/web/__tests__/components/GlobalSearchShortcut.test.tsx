/**
 * __tests__/components/GlobalSearchShortcut.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { GlobalSearchShortcut } from '@/components/shared/GlobalSearchShortcut';

const push = vi.fn();
const pathname = vi.fn(() => '/');

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
  usePathname: () => pathname(),
}));

vi.mock('@/lib/constants', () => ({
  ROUTES: { search: '/search' },
}));

describe('GlobalSearchShortcut', () => {
  beforeEach(() => {
    push.mockReset();
    pathname.mockReturnValue('/');
  });

  it('renders nothing visible', () => {
    const { container } = render(<GlobalSearchShortcut />);
    expect(container).toBeEmptyDOMElement();
  });

  it('navigates to search on Ctrl+K when not typing', () => {
    render(<GlobalSearchShortcut />);
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
    );
    expect(push).toHaveBeenCalledWith('/search?focus=1');
  });

  it('does not navigate when typing in input', () => {
    render(<GlobalSearchShortcut />);
    const input = document.createElement('input');
    document.body.appendChild(input);
    input.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }),
    );
    expect(push).not.toHaveBeenCalled();
    input.remove();
  });

  it('focuses search input when already on /search', () => {
    pathname.mockReturnValue('/search');
    const el = document.createElement('input');
    el.id = 'global-search-input';
    document.body.appendChild(el);
    const focus = vi.spyOn(el, 'focus');
    render(<GlobalSearchShortcut />);
    window.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'k', metaKey: true, bubbles: true }),
    );
    expect(focus).toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    el.remove();
  });
});
