/**
 * يتحقق من ظهور تنبيه «بيانات قديمة» و«محفوظ للأوفلاين» عند رسائل الـ SW.
 * ملاحظة: setup العام يجعل usePathname() = '/dashboard'.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderWithProviders as render, screen, act } from '@/test-support/render';

const online = vi.hoisted(() => ({ value: false }));
vi.mock('@/hooks/useOnlineStatus', () => ({ useOnlineStatus: () => online.value }));

import { OfflineStatusNotices } from '@/components/offline/OfflineStatusNotices';

describe('OfflineStatusNotices', () => {
  let listeners: Array<(e: MessageEvent) => void> = [];
  const post = (data: unknown) => act(() => { listeners.forEach((l) => l({ data } as MessageEvent)); });

  beforeEach(() => {
    online.value = false;
    listeners = [];
    Object.defineProperty(navigator, 'serviceWorker', {
      configurable: true,
      value: {
        addEventListener: (_: string, l: (e: MessageEvent) => void) => listeners.push(l),
        removeEventListener: (_: string, l: (e: MessageEvent) => void) => { listeners = listeners.filter((x) => x !== l); },
      },
    });
  });
  afterEach(() => { Reflect.deleteProperty(navigator, 'serviceWorker'); });

  it('renders nothing until the SW reports something', () => {
    const { container } = render(<OfflineStatusNotices />);
    expect(container.textContent).toBe('');
  });

  it('shows the stale-data chip while offline', () => {
    render(<OfflineStatusNotices />);
    post({ type: 'STALE_API_SERVED', cachedAt: Date.now() - 2 * 86_400_000 });
    expect(screen.getByText(/بيانات قديمة/)).toBeTruthy();
  });

  it('shows a pending-save notice only for the current page', () => {
    render(<OfflineStatusNotices />);
    post({ type: 'SHELL_CACHE_RESULT', pathname: '/somewhere-else', status: 'pending' });
    expect(screen.queryByText(/جارٍ إكمال حفظ/)).toBeNull();
    post({ type: 'SHELL_CACHE_RESULT', pathname: '/dashboard', status: 'pending' });
    expect(screen.getByText(/جارٍ إكمال حفظ/)).toBeTruthy();
  });

  it('refetches active queries and hides the chip once back online', () => {
    const { queryClient, rerender } = render(<OfflineStatusNotices />);
    const spy = vi.spyOn(queryClient, 'invalidateQueries');
    post({ type: 'STALE_API_SERVED', cachedAt: Date.now() - 86_400_000 });
    online.value = true;
    act(() => { rerender(<OfflineStatusNotices />); });
    expect(spy).toHaveBeenCalled();
    expect(screen.queryByText(/بيانات قديمة/)).toBeNull();
  });
});
