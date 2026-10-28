import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { OfflineActionGate, OfflineNotice } from '@/components/shared/OfflineActionGate';

describe('OfflineActionGate', () => {
  let onlineSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    onlineSpy = vi.spyOn(window.navigator, 'onLine', 'get');
  });

  afterEach(() => {
    onlineSpy.mockRestore();
  });

  it('hides notice when online', async () => {
    onlineSpy.mockReturnValue(true);
    render(
      <OfflineActionGate>
        <button type="button">أرسل</button>
      </OfflineActionGate>,
    );
    await waitFor(() => {
      expect(screen.queryByRole('status')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'أرسل' })).toBeInTheDocument();
  });

  it('shows offline message and gates pointer when offline', async () => {
    onlineSpy.mockReturnValue(false);
    const { container } = render(
      <OfflineActionGate message="يحتاج اتصال">
        <button type="button">أرسل</button>
      </OfflineActionGate>,
    );
    // useOnlineStatus starts true then flips in effect
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('يحتاج اتصال');
    });
    const gate = container.querySelector('[aria-disabled="true"]');
    expect(gate).toBeTruthy();
    expect(gate?.className).toMatch(/pointer-events-none/);
  });

  it('shows message but does not gate when disableWhenOffline is false', async () => {
    onlineSpy.mockReturnValue(false);
    const { container } = render(
      <OfflineActionGate disableWhenOffline={false} message="بدون تعطيل">
        <button type="button">أرسل</button>
      </OfflineActionGate>,
    );
    await waitFor(() => {
      expect(screen.getByRole('status')).toHaveTextContent('بدون تعطيل');
    });
    expect(container.querySelector('[aria-disabled="true"]')).toBeNull();
  });
});

describe('OfflineNotice', () => {
  let onlineSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    onlineSpy = vi.spyOn(window.navigator, 'onLine', 'get');
  });

  afterEach(() => {
    onlineSpy.mockRestore();
  });

  it('renders nothing when online', async () => {
    onlineSpy.mockReturnValue(true);
    const { container } = render(<OfflineNotice />);
    await waitFor(() => {
      expect(container.querySelector('[role="status"]')).toBeNull();
    });
  });
});
