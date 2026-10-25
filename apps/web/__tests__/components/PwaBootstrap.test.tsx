/**
 * __tests__/components/PwaBootstrap.test.tsx
 *
 * PLAN-runtime-separation (مرحلة 2/6): PwaBootstrap.tsx تم تضييق نطاقه إلى
 * SW registration + InstallPrompt + UpdatePrompt فقط. كل اختبارات queue
 * replay/warming/push-sync انتقلت إلى OfflineBootstrap.test.tsx الجديد
 * (نفس الاختبارات، نفس السلوك المتوقع، ملف مختلف يطابق OfflineBootstrap.tsx).
 *
 * Covers: registers the service worker on mount, renders both
 * InstallPrompt and UpdatePrompt. The effect-ordering comment in the
 * source (UpdatePrompt must mount/run its effect before
 * registerServiceWorker fires) is a render-order property, not
 * independently assertable via mocks here.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { PwaBootstrap } from '@/components/pwa/PwaBootstrap';
import { registerServiceWorker } from '@/lib/pwa';

vi.mock('@/lib/pwa', () => ({
  registerServiceWorker: vi.fn().mockResolvedValue(null),
}));

vi.mock('@/lib/runtime/appMode', () => ({
  getAppMode: vi.fn().mockResolvedValue('web'),
}));

vi.mock('@/components/pwa/InstallPrompt', () => ({
  InstallPrompt: () => <div data-testid="install-prompt" />,
}));

vi.mock('@/components/pwa/UpdatePrompt', () => ({
  UpdatePrompt: () => <div data-testid="update-prompt" />,
}));

describe('PwaBootstrap', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('registers the service worker after resolving the app mode on mount', async () => {
    render(<PwaBootstrap />);

    await waitFor(() => expect(registerServiceWorker).toHaveBeenCalledTimes(1));
    expect(document.documentElement.dataset.appMode).toBe('web');
  });

  it('renders both InstallPrompt and UpdatePrompt', () => {
    const { getByTestId } = render(<PwaBootstrap />);

    expect(getByTestId('install-prompt')).toBeInTheDocument();
    expect(getByTestId('update-prompt')).toBeInTheDocument();
  });
});
