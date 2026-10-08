import { act, render, screen } from '@testing-library/react';
import { renderToString } from 'react-dom/server';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

function Status({ id }: { id: string }) {
  const online = useOnlineStatus();
  return <output data-testid={id}>{online ? 'online' : 'offline'}</output>;
}

function setNavigatorOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    configurable: true,
    value,
  });
}

describe('useOnlineStatus', () => {
  beforeEach(() => {
    setNavigatorOnline(true);
  });

  afterEach(() => {
    setNavigatorOnline(true);
    vi.restoreAllMocks();
  });

  it('shares one pair of browser listeners across multiple consumers', () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');

    const { unmount, rerender } = render(
      <>
        <Status id="one" />
        <Status id="two" />
      </>,
    );

    expect(addSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(1);
    expect(addSpy.mock.calls.filter(([type]) => type === 'offline')).toHaveLength(1);
    expect(screen.getByTestId('one')).toHaveTextContent('online');
    expect(screen.getByTestId('two')).toHaveTextContent('online');

    rerender(
      <>
        <Status id="one" />
      </>,
    );

    expect(removeSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(0);
    expect(removeSpy.mock.calls.filter(([type]) => type === 'offline')).toHaveLength(0);

    unmount();

    expect(removeSpy.mock.calls.filter(([type]) => type === 'online')).toHaveLength(1);
    expect(removeSpy.mock.calls.filter(([type]) => type === 'offline')).toHaveLength(1);
  });

  it('updates every consumer when the browser changes connectivity', () => {
    const { unmount } = render(
      <>
        <Status id="one" />
        <Status id="two" />
      </>,
    );

    act(() => {
      setNavigatorOnline(false);
      window.dispatchEvent(new Event('offline'));
    });

    expect(screen.getByTestId('one')).toHaveTextContent('offline');
    expect(screen.getByTestId('two')).toHaveTextContent('offline');

    act(() => {
      setNavigatorOnline(true);
      window.dispatchEvent(new Event('online'));
    });

    expect(screen.getByTestId('one')).toHaveTextContent('online');
    expect(screen.getByTestId('two')).toHaveTextContent('online');

    unmount();
  });

  it('keeps the server snapshot stable at online', () => {
    setNavigatorOnline(false);

    // The server snapshot must not read navigator.onLine. The client then
    // synchronizes to the actual browser value after subscription.
    expect(renderToString(<Status id="status" />)).toContain('>online<');

    const { container, unmount } = render(<Status id="status" />);
    expect(container.querySelector('[data-testid="status"]')).toHaveTextContent('offline');
    unmount();
  });
});
