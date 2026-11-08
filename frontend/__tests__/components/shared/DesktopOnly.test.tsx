import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DesktopOnly } from '@/components/shared/layout/DesktopOnly';

type MediaListener = (event: MediaQueryListEvent) => void;

function installMatchMedia(initialMatches: boolean) {
  let matches = initialMatches;
  const listeners = new Set<MediaListener>();
  const media = {
    get matches() { return matches; },
    media: '(min-width: 1024px)',
    onchange: null,
    addEventListener: (_type: string, listener: MediaListener) => listeners.add(listener),
    removeEventListener: (_type: string, listener: MediaListener) => listeners.delete(listener),
    addListener: (listener: MediaListener) => listeners.add(listener),
    removeListener: (listener: MediaListener) => listeners.delete(listener),
    dispatchEvent: () => true,
  } as unknown as MediaQueryList;

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    value: () => media,
  });

  return {
    setMatches(next: boolean) {
      matches = next;
      act(() => {
        for (const listener of listeners) {
          listener({ matches, media: '(min-width: 1024px)' } as MediaQueryListEvent);
        }
      });
    },
  };
}

describe('DesktopOnly', () => {
  let originalMatchMedia: PropertyDescriptor | undefined;

  beforeEach(() => {
    originalMatchMedia = Object.getOwnPropertyDescriptor(window, 'matchMedia');
  });

  afterEach(() => {
    if (originalMatchMedia) {
      Object.defineProperty(window, 'matchMedia', originalMatchMedia);
    } else {
      Reflect.deleteProperty(window, 'matchMedia');
    }
    vi.unstubAllGlobals();
  });

  it('does not mount hidden desktop-only content on mobile widths', () => {
    installMatchMedia(false);
    render(<DesktopOnly><div data-testid="sidebar-query">Sidebar</div></DesktopOnly>);
    expect(screen.queryByTestId('sidebar-query')).not.toBeInTheDocument();
  });

  it('mounts desktop-only content when the viewport enters the desktop breakpoint', () => {
    const media = installMatchMedia(false);
    render(<DesktopOnly><div data-testid="sidebar-query">Sidebar</div></DesktopOnly>);
    expect(screen.queryByTestId('sidebar-query')).not.toBeInTheDocument();

    media.setMatches(true);
    expect(screen.getByTestId('sidebar-query')).toBeInTheDocument();
  });
});
