import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { InfiniteScrollTrigger } from '@/components/shared/list/InfiniteScrollTrigger';

describe('InfiniteScrollTrigger', () => {
  let observerCtor: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    observerCtor = vi.fn(() => ({
      observe: vi.fn(),
      unobserve: vi.fn(),
      disconnect: vi.fn(),
      takeRecords: vi.fn(),
      root: null,
      rootMargin: '',
      thresholds: [],
    }));
    vi.stubGlobal('IntersectionObserver', observerCtor);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('observes the sentinel while more pages exist and there is no error', () => {
    render(<InfiniteScrollTrigger hasNextPage isFetchingNextPage={false} onLoadMore={vi.fn()} />);
    expect(observerCtor).toHaveBeenCalledTimes(1);
  });

  it('pauses auto-loading after a failed fetch and offers an explicit retry (SCROLL-ERR-01)', () => {
    const onLoadMore = vi.fn();
    render(<InfiniteScrollTrigger hasNextPage isFetchingNextPage={false} isError onLoadMore={onLoadMore} />);
    expect(observerCtor).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'إعادة المحاولة' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('does not recreate the observer when the parent re-renders with a new callback', () => {
    const { rerender } = render(
      <InfiniteScrollTrigger hasNextPage isFetchingNextPage={false} onLoadMore={() => undefined} />,
    );
    rerender(<InfiniteScrollTrigger hasNextPage isFetchingNextPage={false} onLoadMore={() => undefined} />);
    expect(observerCtor).toHaveBeenCalledTimes(1);
  });
});
