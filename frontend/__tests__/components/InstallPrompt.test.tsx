/**
 * __tests__/components/InstallPrompt.test.tsx
 *
 * Previously uncovered (0%), ~118 lines. Three distinct code paths to
 * cover:
 *
 *  - already standalone (installed) → never shows anything, no
 *    listener registered
 *  - within the 7-day dismiss cooldown → stays hidden
 *  - Android/Chrome: `beforeinstallprompt` captured → custom bar with
 *    an install button; accepting/dismissing the native prompt both
 *    persist the dismissal and clear the deferred event
 *  - iOS Safari: no `beforeinstallprompt` support, so the iOS text
 *    hint renders instead once `showIosHint` is set
 *  - dismiss button always persists a timestamp and hides the prompt
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, act } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { InstallPrompt } from '@/components/pwa/InstallPrompt';

const DISMISS_STORAGE_KEY = 'pwa-install-dismissed-at';

function mockMatchMedia(standalone: boolean) {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query === '(display-mode: standalone)' ? standalone : false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function mockUserAgent(ua: string) {
  Object.defineProperty(window.navigator, 'userAgent', {
    value: ua,
    configurable: true,
  });
}

function makeBeforeInstallPromptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt', { cancelable: true }) as any;
  event.prompt = vi.fn().mockResolvedValue(undefined);
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe('InstallPrompt', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    mockMatchMedia(false);
    mockUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
    );
    Object.defineProperty(window.navigator, 'standalone', {
      value: undefined,
      configurable: true,
    });
  });

  it('renders nothing when already installed (standalone display mode)', () => {
    mockMatchMedia(true);
    const { container } = render(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when running in iOS standalone mode via navigator.standalone', () => {
    Object.defineProperty(window.navigator, 'standalone', {
      value: true,
      configurable: true,
    });
    const { container } = render(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing within the 7-day dismiss cooldown', () => {
    localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now() - 1000));
    const { container } = render(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });

  it('shows the prompt again once the cooldown has passed', () => {
    const eightDaysAgo = Date.now() - 8 * 24 * 60 * 60 * 1000;
    localStorage.setItem(DISMISS_STORAGE_KEY, String(eightDaysAgo));
    mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');

    render(<InstallPrompt />);

    expect(screen.getByText('ثبّت تطبيق سوق غزة')).toBeInTheDocument();
  });

  describe('Android/Chrome — beforeinstallprompt flow', () => {
    it('shows the custom install bar with an install button once the event fires', () => {
      render(<InstallPrompt />);
      expect(screen.queryByText('ثبّت تطبيق سوق غزة')).not.toBeInTheDocument();

      act(() => {
        window.dispatchEvent(makeBeforeInstallPromptEvent());
      });

      expect(screen.getByText('ثبّت تطبيق سوق غزة')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'تثبيت' })).toBeInTheDocument();
    });

    it('calls prompt() and userChoice, then dismisses on install', async () => {
      const user = setupUser();
      render(<InstallPrompt />);
      const event = makeBeforeInstallPromptEvent('accepted');

      act(() => {
        window.dispatchEvent(event);
      });

      await user.click(screen.getByRole('button', { name: 'تثبيت' }));

      expect(event.prompt).toHaveBeenCalledTimes(1);
      expect(screen.queryByText('ثبّت تطبيق سوق غزة')).not.toBeInTheDocument();
      expect(localStorage.getItem(DISMISS_STORAGE_KEY)).not.toBeNull();
    });

    it('still dismisses even when the user declines the native prompt', async () => {
      const user = setupUser();
      render(<InstallPrompt />);
      const event = makeBeforeInstallPromptEvent('dismissed');

      act(() => {
        window.dispatchEvent(event);
      });

      await user.click(screen.getByRole('button', { name: 'تثبيت' }));

      expect(screen.queryByText('ثبّت تطبيق سوق غزة')).not.toBeInTheDocument();
      expect(localStorage.getItem(DISMISS_STORAGE_KEY)).not.toBeNull();
    });

    it('removes the beforeinstallprompt listener on unmount', () => {
      const removeSpy = vi.spyOn(window, 'removeEventListener');
      const { unmount } = render(<InstallPrompt />);

      unmount();

      expect(removeSpy).toHaveBeenCalledWith('beforeinstallprompt', expect.any(Function));
    });
  });

  describe('iOS Safari — text hint flow', () => {
    beforeEach(() => {
      mockUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15');
    });

    it('shows the iOS share/add-to-home-screen hint instead of an install button', () => {
      render(<InstallPrompt />);

      expect(screen.getByText('ثبّت تطبيق سوق غزة')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'تثبيت' })).not.toBeInTheDocument();
      expect(screen.getByText(/إضافة إلى الشاشة الرئيسية/)).toBeInTheDocument();
    });

    it('dismisses the iOS hint via the close button and persists the dismissal', async () => {
      const user = setupUser();
      render(<InstallPrompt />);

      await user.click(screen.getByRole('button', { name: 'إغلاق' }));

      expect(screen.queryByText('ثبّت تطبيق سوق غزة')).not.toBeInTheDocument();
      expect(localStorage.getItem(DISMISS_STORAGE_KEY)).not.toBeNull();
    });
  });

  it('renders nothing on Android/desktop Chrome before beforeinstallprompt has fired', () => {
    const { container } = render(<InstallPrompt />);

    expect(container).toBeEmptyDOMElement();
  });
});
