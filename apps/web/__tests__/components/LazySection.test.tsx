import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LazySection } from '@/components/shared/LazySection';

describe('LazySection', () => {
  let observe: ReturnType<typeof vi.fn>;
  let disconnect: ReturnType<typeof vi.fn>;
  let trigger: ((entries: IntersectionObserverEntry[]) => void) | null = null;

  beforeEach(() => {
    observe = vi.fn();
    disconnect = vi.fn();
    trigger = null;
    vi.stubGlobal(
      'IntersectionObserver',
      vi.fn((cb: IntersectionObserverCallback) => {
        trigger = cb as unknown as (entries: IntersectionObserverEntry[]) => void;
        return { observe, unobserve: vi.fn(), disconnect, takeRecords: vi.fn(), root: null, rootMargin: '', thresholds: [] };
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('shows fallback until intersection, then children', () => {
    render(
      <LazySection fallback={<div data-testid="fallback">loading</div>}>
        <div data-testid="content">ready</div>
      </LazySection>,
    );
    expect(screen.getByTestId('fallback')).toBeInTheDocument();
    expect(screen.queryByTestId('content')).not.toBeInTheDocument();
    expect(observe).toHaveBeenCalled();

    act(() => {
      trigger?.([{ isIntersecting: true } as IntersectionObserverEntry]);
    });
    expect(screen.getByTestId('content')).toBeInTheDocument();
    expect(disconnect).toHaveBeenCalled();
  });
});
