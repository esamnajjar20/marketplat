/**
 * __tests__/components/CapacitorBootstrap.test.tsx
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { CapacitorBootstrap } from '@/components/pwa/CapacitorBootstrap';
import { isNativePlatform } from '@/lib/capacitor/platform';
import { registerDeepLinkListener } from '@/lib/capacitor/deepLinks';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), back: vi.fn() }),
}));

vi.mock('@/lib/capacitor/platform', () => ({
  isNativePlatform: vi.fn(async () => false),
}));

vi.mock('@/lib/capacitor/deepLinks', () => ({
  registerDeepLinkListener: vi.fn(async () => () => {}),
}));

vi.mock('@capacitor/splash-screen', () => ({
  SplashScreen: { hide: vi.fn(async () => undefined) },
}));
vi.mock('@capacitor/status-bar', () => ({
  StatusBar: {
    setBackgroundColor: vi.fn(async () => undefined),
    setStyle: vi.fn(async () => undefined),
  },
  Style: { Dark: 'DARK', Light: 'LIGHT' },
}));
vi.mock('@capacitor/app', () => ({
  App: {
    addListener: vi.fn(async () => ({ remove: vi.fn() })),
  },
}));

describe('CapacitorBootstrap', () => {
  beforeEach(() => {
    vi.mocked(isNativePlatform).mockResolvedValue(false);
    vi.mocked(registerDeepLinkListener).mockClear();
  });

  it('renders nothing', () => {
    const { container } = render(<CapacitorBootstrap />);
    expect(container).toBeEmptyDOMElement();
  });

  it('does not register deep links on web', async () => {
    render(<CapacitorBootstrap />);
    await waitFor(() => {
      expect(isNativePlatform).toHaveBeenCalled();
    });
    expect(registerDeepLinkListener).not.toHaveBeenCalled();
  });

  it('registers deep links when native', async () => {
    vi.mocked(isNativePlatform).mockResolvedValue(true);
    render(<CapacitorBootstrap />);
    await waitFor(() => {
      expect(registerDeepLinkListener).toHaveBeenCalled();
    });
  });
});
