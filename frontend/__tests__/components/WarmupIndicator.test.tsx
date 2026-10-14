/**
 * __tests__/components/WarmupIndicator.test.tsx
 *
 * Real logic under test: renders nothing until an active progress event
 * arrives, updates progress, disappears on active:false, X only hides
 * locally, and a fresh cycle re-shows after dismissal.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { WarmupIndicator } from '@/components/pwa/WarmupIndicator';
import {
  subscribeWarmingProgress,
  type AggregatedProgress,
} from '@/lib/warmingProgress';

vi.mock('@/lib/warmingProgress', () => ({
  subscribeWarmingProgress: vi.fn(),
}));

const mockSubscribe = vi.mocked(subscribeWarmingProgress);
const mockUnsubscribe = vi.fn();

function makeAgg(partial: {
  active: boolean;
  completed?: number;
  total?: number;
}): AggregatedProgress {
  const completed = partial.completed ?? 0;
  const total = partial.total ?? 0;
  return {
    active: partial.active,
    completed,
    total,
    bySource: {
      core: { active: partial.active, completed, total },
      routes: { active: false, completed: 0, total: 0 },
      personal: { active: false, completed: 0, total: 0 },
      userdata: { active: false, completed: 0, total: 0 },
    },
  };
}

describe('WarmupIndicator', () => {
  let capturedListener: (progress: AggregatedProgress) => void = () => {};

  beforeEach(() => {
    vi.clearAllMocks();
    try {
      sessionStorage.removeItem('marketplat:warmup-indicator-shown');
    } catch {
      /* ignore */
    }
    mockSubscribe.mockImplementation((listener) => {
      capturedListener = listener;
      listener(makeAgg({ active: false }));
      return mockUnsubscribe;
    });
  });

  afterEach(() => {
    try {
      sessionStorage.removeItem('marketplat:warmup-indicator-shown');
    } catch {
      /* ignore */
    }
  });

  it('renders nothing while no warm-up cycle is active', () => {
    const { container } = render(<WarmupIndicator />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the banner once a cycle starts and reflects progress', () => {
    render(<WarmupIndicator />);
    expect(screen.queryByText('جارٍ تجهيز التصفح بدون إنترنت…')).not.toBeInTheDocument();

    act(() => {
      capturedListener(makeAgg({ active: true, completed: 0, total: 5 }));
    });
    expect(screen.getByText('جارٍ تجهيز التصفح بدون إنترنت…')).toBeInTheDocument();
    expect(screen.getByRole('status')).toBeInTheDocument();

    act(() => {
      capturedListener(makeAgg({ active: true, completed: 3, total: 5 }));
    });
    expect(screen.getByText('60%')).toBeInTheDocument();
  });

  it('auto-hides when the cycle completes (active:false), without any user action', () => {
    render(<WarmupIndicator />);

    act(() => {
      capturedListener(makeAgg({ active: true, completed: 0, total: 5 }));
    });
    expect(screen.getByText('جارٍ تجهيز التصفح بدون إنترنت…')).toBeInTheDocument();

    act(() => {
      capturedListener(makeAgg({ active: false, completed: 5, total: 5 }));
    });
    expect(screen.queryByText('جارٍ تجهيز التصفح بدون إنترنت…')).not.toBeInTheDocument();
  });

  it('closing the banner hides it locally without unsubscribing (warm-up keeps running)', async () => {
    const user = setupUser();
    render(<WarmupIndicator />);

    act(() => {
      capturedListener(makeAgg({ active: true, completed: 0, total: 5 }));
    });
    expect(screen.getByText('جارٍ تجهيز التصفح بدون إنترنت…')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'إخفاء — يستمر التحميل بالخلفية' }));
    expect(screen.queryByText('جارٍ تجهيز التصفح بدون إنترنت…')).not.toBeInTheDocument();
    expect(mockUnsubscribe).not.toHaveBeenCalled();

    act(() => {
      capturedListener(makeAgg({ active: true, completed: 4, total: 5 }));
    });
    expect(screen.queryByText('جارٍ تجهيز التصفح بدون إنترنت…')).not.toBeInTheDocument();
  });

  it('a fresh cycle (active:false -> active:true) re-shows the banner even after a previous dismissal', async () => {
    const user = setupUser();
    render(<WarmupIndicator />);

    act(() => {
      capturedListener(makeAgg({ active: true, completed: 0, total: 5 }));
    });
    await user.click(screen.getByRole('button', { name: 'إخفاء — يستمر التحميل بالخلفية' }));
    expect(screen.queryByText('جارٍ تجهيز التصفح بدون إنترنت…')).not.toBeInTheDocument();

    act(() => {
      capturedListener(makeAgg({ active: false, completed: 5, total: 5 }));
    });
    act(() => {
      capturedListener(makeAgg({ active: true, completed: 0, total: 5 }));
    });
    expect(screen.getByText('جارٍ تجهيز التصفح بدون إنترنت…')).toBeInTheDocument();
  });
});
