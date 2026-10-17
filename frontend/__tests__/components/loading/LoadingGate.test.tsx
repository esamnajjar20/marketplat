import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { LoadingGate } from '@/components/shared/feedback/LoadingGate';
import { PageLoadingState } from '@/components/shared/feedback/PageLoadingState';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('LoadingGate', () => {
  it('renders children immediately when not loading', () => {
    render(<LoadingGate loading={false} fallback={<p>skeleton</p>}><p>content</p></LoadingGate>);
    expect(screen.getByText('content')).toBeInTheDocument();
    expect(screen.queryByText('skeleton')).not.toBeInTheDocument();
  });

  it('reserves the fallback hidden first, then reveals it after the delay', () => {
    const { container } = render(<LoadingGate loading fallback={<p>skeleton</p>}><p>content</p></LoadingGate>);
    const region = container.firstElementChild as HTMLElement;
    expect(screen.queryByText('content')).not.toBeInTheDocument();
    expect(region).toHaveClass('opacity-0');
    expect(region).toHaveAttribute('aria-hidden', 'true');
    act(() => { vi.advanceTimersByTime(500); });
    expect(region).toHaveClass('loading-reveal');
    expect(region).toHaveAttribute('aria-hidden', 'false');
    expect(region).toHaveAttribute('aria-busy', 'true');
  });
});

describe('PageLoadingState', () => {
  it('is delayed by default and has a single status region', () => {
    const { container } = render(<PageLoadingState variant="table" />);
    expect(container.firstElementChild).toHaveClass('loading-delayed');
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('can opt out of the delay', () => {
    const { container } = render(<PageLoadingState delayed={false} />);
    expect(container.firstElementChild).not.toHaveClass('loading-delayed');
  });
});
