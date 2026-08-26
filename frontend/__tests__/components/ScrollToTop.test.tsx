import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { ScrollToTop } from '@/components/shared/ui/ScrollToTop';
describe('ScrollToTop', () => {
  beforeEach(() => { vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined); });
  afterEach(() => vi.restoreAllMocks());
  it('shows after scroll and scrolls on click', () => {
    render(<ScrollToTop />);
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    act(() => {
      Object.defineProperty(window, 'scrollY', { value: 500, configurable: true });
      window.dispatchEvent(new Event('scroll'));
    });
    fireEvent.click(screen.getByRole('button'));
    expect(window.scrollTo).toHaveBeenCalled();
  });
});
