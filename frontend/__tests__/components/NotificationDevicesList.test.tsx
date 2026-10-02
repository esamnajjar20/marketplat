import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { NotificationDevicesList } from '@/components/pwa/NotificationDevicesList';
import { useNotificationDevices } from '@/hooks/queries/useNotificationDevices';
import {
  useRemoveNotificationDevice,
  useRenameNotificationDevice,
} from '@/hooks/mutations/useNotificationMutations';
import { getThisDeviceFingerprint } from '@/lib/runtime/deviceFingerprint';

vi.mock('@/hooks/queries/useNotificationDevices', () => ({ useNotificationDevices: vi.fn() }));
vi.mock('@/hooks/mutations/useNotificationMutations', () => ({
  useRenameNotificationDevice: vi.fn(),
  useRemoveNotificationDevice: vi.fn(),
}));
vi.mock('@/lib/runtime/deviceFingerprint', () => ({ getThisDeviceFingerprint: vi.fn() }));

const NOW = new Date().toISOString();
const DEVICES = [
  { id: 'w1', kind: 'web', label: 'Chrome · Android', platform: null, fingerprint: 'aaaaaaaaaaaaaaaa', createdAt: NOW, lastSeenAt: NOW },
  { id: 'n1', kind: 'native', label: null, platform: 'android', fingerprint: 'bbbbbbbbbbbbbbbb', createdAt: NOW, lastSeenAt: NOW },
];

const renameMutate = vi.fn();
const removeMutate = vi.fn();

describe('NotificationDevicesList', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useNotificationDevices as ReturnType<typeof vi.fn>).mockReturnValue({
      data: DEVICES,
      isLoading: false,
      isError: false,
    });
    (useRenameNotificationDevice as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: renameMutate, isPending: false });
    (useRemoveNotificationDevice as ReturnType<typeof vi.fn>).mockReturnValue({ mutate: removeMutate, isPending: false });
    (getThisDeviceFingerprint as ReturnType<typeof vi.fn>).mockResolvedValue('aaaaaaaaaaaaaaaa');
  });

  it('renders nothing while loading, on error, or with no devices', () => {
    for (const state of [
      { data: undefined, isLoading: true, isError: false },
      { data: undefined, isLoading: false, isError: true },
      { data: [], isLoading: false, isError: false },
    ]) {
      (useNotificationDevices as ReturnType<typeof vi.fn>).mockReturnValue(state);
      const { container, unmount } = render(<NotificationDevicesList />);
      expect(container).toBeEmptyDOMElement();
      unmount();
    }
  });

  it('lists devices, falls back to a generic name, and marks this device', async () => {
    render(<NotificationDevicesList />);
    expect(screen.getByText('Chrome · Android')).toBeInTheDocument();
    expect(screen.getByText('تطبيق الجوال')).toBeInTheDocument();
    expect(await screen.findByText('هذا الجهاز')).toBeInTheDocument();
  });

  it('does not offer deletion for this device, but does for others', async () => {
    render(<NotificationDevicesList />);
    await screen.findByText('هذا الجهاز');
    expect(screen.queryByRole('button', { name: 'حذف Chrome · Android' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'حذف تطبيق الجوال' })).toBeInTheDocument();
  });

  it('requires a second click to delete another device', async () => {
    const user = setupUser();
    render(<NotificationDevicesList />);
    await user.click(screen.getByRole('button', { name: 'حذف تطبيق الجوال' }));
    expect(removeMutate).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'تأكيد الحذف' }));
    expect(removeMutate).toHaveBeenCalledWith({ kind: 'native', id: 'n1' }, expect.anything());
  });

  it('renames a device with a trimmed label', async () => {
    const user = setupUser();
    render(<NotificationDevicesList />);
    await user.click(screen.getByRole('button', { name: 'إعادة تسمية Chrome · Android' }));
    const input = screen.getByLabelText('اسم الجهاز');
    await user.clear(input);
    await user.type(input, '  هاتفي  ');
    await user.click(screen.getByRole('button', { name: 'حفظ الاسم' }));
    expect(renameMutate).toHaveBeenCalledWith(
      { kind: 'web', id: 'w1', label: 'هاتفي' },
      expect.anything(),
    );
  });

  it('does not call the API when the name is unchanged or empty', async () => {
    const user = setupUser();
    render(<NotificationDevicesList />);
    await user.click(screen.getByRole('button', { name: 'إعادة تسمية Chrome · Android' }));
    await user.click(screen.getByRole('button', { name: 'حفظ الاسم' }));
    expect(renameMutate).not.toHaveBeenCalled();
  });
});
