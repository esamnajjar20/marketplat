/**
 * __tests__/components/NotificationSettingsForm.test.tsx
 *
 * Coverage for components/profile/NotificationSettingsForm.tsx.
 * FEAT-02 regression coverage: previously this form was purely local
 * state with a toast-only "save" — nothing persisted. Now it loads real
 * preferences via useMe() and saves each toggle immediately via
 * useUpdateNotificationPreferences(). Both halves are pinned down here.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotificationSettingsForm } from '@/components/profile/NotificationSettingsForm';
import { useMe } from '@/hooks/queries/useAuth';
import { useUpdateNotificationPreferences } from '@/hooks/mutations/useUpdateProfile';

vi.mock('@/hooks/queries/useAuth', () => ({
  useMe: vi.fn(),
}));

vi.mock('@/hooks/mutations/useUpdateProfile', () => ({
  useUpdateNotificationPreferences: vi.fn(),
}));

const mockMutate = vi.fn();

describe('NotificationSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useUpdateNotificationPreferences as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: false,
    });
  });

  it('shows a loading spinner while the user profile is loading', () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({ data: undefined, isLoading: true });
    render(<NotificationSettingsForm />);

    // LoadingSpinner renders without a specific accessible name in this
    // codebase's implementation — assert via the switches not being present yet.
    expect(screen.queryByRole('switch')).not.toBeInTheDocument();
  });

  it('renders one toggle switch per notification setting', () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { notificationPreferences: { newMessage: true, adViews: false, favAdUpdated: true, promotions: false } },
      isLoading: false,
    });
    render(<NotificationSettingsForm />);

    expect(screen.getAllByRole('switch')).toHaveLength(4);
  });

  it('reflects the server-loaded preferences via aria-checked (FEAT-02: no longer hardcoded defaults)', () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { notificationPreferences: { newMessage: false, adViews: true, favAdUpdated: false, promotions: true } },
      isLoading: false,
    });
    render(<NotificationSettingsForm />);

    expect(screen.getByRole('switch', { name: 'رسائل جديدة' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'مشاهدات الإعلان' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'عروض وتخفيضات' })).toHaveAttribute('aria-checked', 'true');
  });

  it('falls back to the documented defaults when the user has no saved preferences yet', () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { notificationPreferences: undefined },
      isLoading: false,
    });
    render(<NotificationSettingsForm />);

    expect(screen.getByRole('switch', { name: 'رسائل جديدة' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'مشاهدات الإعلان' })).toHaveAttribute('aria-checked', 'false');
  });

  it('toggling a switch flips it optimistically and persists only that one key (FEAT-02)', async () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { notificationPreferences: { newMessage: true, adViews: false, favAdUpdated: true, promotions: false } },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<NotificationSettingsForm />);

    const adViewsSwitch = screen.getByRole('switch', { name: 'مشاهدات الإعلان' });
    expect(adViewsSwitch).toHaveAttribute('aria-checked', 'false');

    await user.click(adViewsSwitch);

    expect(adViewsSwitch).toHaveAttribute('aria-checked', 'true');
    expect(mockMutate).toHaveBeenCalledWith({ adViews: true });
    // Only the toggled key is sent — a partial update, not the whole object.
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toEqual({ adViews: true });
  });

  it('toggling an already-true switch flips it to false and persists that', async () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { notificationPreferences: { newMessage: true, adViews: false, favAdUpdated: true, promotions: false } },
      isLoading: false,
    });
    const user = userEvent.setup();
    render(<NotificationSettingsForm />);

    await user.click(screen.getByRole('switch', { name: 'رسائل جديدة' }));

    expect(mockMutate).toHaveBeenCalledWith({ newMessage: false });
  });

  it('disables all switches while a save is pending', () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { notificationPreferences: { newMessage: true, adViews: false, favAdUpdated: true, promotions: false } },
      isLoading: false,
    });
    (useUpdateNotificationPreferences as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    });
    render(<NotificationSettingsForm />);

    screen.getAllByRole('switch').forEach((sw) => expect(sw).toBeDisabled());
  });
});
