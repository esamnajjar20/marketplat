import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getOnlineSnapshot,
  subscribeNetworkLifecycle,
  subscribeOnlineStatus,
} from '@/lib/networkLifecycle';

function setOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

describe('shared network lifecycle', () => {
  afterEach(() => {
    setOnline(true);
    vi.restoreAllMocks();
  });

  it('shares browser connectivity listeners between online and policy subscribers', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const stopOnline = subscribeOnlineStatus(() => undefined);
    const stopLifecycle = subscribeNetworkLifecycle(() => undefined);

    expect(addSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(1);
    expect(addSpy.mock.calls.filter(([type]) => type === 'offline')).toHaveLength(1);

    stopOnline();
    expect(removeSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(0);
    stopLifecycle();
    expect(removeSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(1);
  });

  it('refreshes connectivity after a suspended tab resumes without an online event', async () => {
    const lifecycleTypes: string[] = [];
    const stopOnline = subscribeOnlineStatus(() => undefined);
    const stopLifecycle = subscribeNetworkLifecycle((event) => lifecycleTypes.push(event.type));

    setOnline(false);
    window.dispatchEvent(new Event('pageshow'));
    await Promise.resolve();

    expect(getOnlineSnapshot()).toBe(false);
    expect(lifecycleTypes).toContain('resume');

    stopOnline();
    stopLifecycle();
  });

  it('emits service-worker controller changes to lifecycle consumers', () => {
    const listener = vi.fn();
    const stop = subscribeNetworkLifecycle(listener);
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.dispatchEvent(new Event('controllerchange'));
      expect(listener).toHaveBeenCalledWith(expect.objectContaining({ type: 'controller-change' }));
    }
    stop();
  });
});
