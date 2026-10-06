/**
 * __tests__/components/NotificationSettingsForm.test.tsx
 *
 * Coverage for components/profile/NotificationSettingsForm.tsx.
 * FEAT-02 regression coverage: previously this form was purely local
 * state with a toast-only "save" — nothing persisted. Now it loads real
 * preferences via useMe() and saves each toggle immediately via
 * useUpdateNotificationPreferences(). Both halves are pinned down here.
 *
 * PROMO-1 (): a fifth toggle (myPromotions, "عروضي") was added
 * alongside the existing four — every notificationPreferences object
 * and the toggle-count assertion below were updated accordingly, and a
 * dedicated describe block covers the new key's happy path the same
 * way the pre-existing tests cover adViews/newMessage.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { setupUser } from '@/test-support/user-event';
import { NotificationSettingsForm } from '@/components/profile/NotificationSettingsForm';
import { useMe } from '@/hooks/queries/useAuth';
import { useUpdateNotificationPreferences } from '@/hooks/mutations/useUpdateProfile';

vi.mock('@/hooks/queries/useAuth', () => ({
  useMe: vi.fn(),
}));

vi.mock('@/hooks/mutations/useUpdateProfile', () => ({
  useUpdateNotificationPreferences: vi.fn(),
}));

// The device list owns its own data hooks (needs a QueryClient); it has its
// own test file and is irrelevant to the preference toggles covered here.
vi.mock('@/components/pwa/NotificationDevicesList', () => ({
  NotificationDevicesList: () => null,
}));

const mockMutate = vi.fn();

const FULL_PREFS = {
  newMessage: true, adViews: false, favAdUpdated: true, promotions: false, myPromotions: true, savedSearch: true, storeUpdates: true, serviceQuotes: true,
};

describe('NotificationSettingsForm', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // clearAllMocks does not clear mockImplementation — the failure-path
    // test below installs an onError-invoking implementation that would
    // otherwise leak and immediately revert later toggle tests.
    mockMutate.mockReset();
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
      data: { notificationPreferences: FULL_PREFS },
      isLoading: false,
    });
    render(<NotificationSettingsForm />);

    expect(screen.getAllByRole('switch')).toHaveLength(8);
  });

  it('reflects the server-loaded preferences via aria-checked (FEAT-02: no longer hardcoded defaults)', () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: {
        notificationPreferences: {
          newMessage: false, adViews: true, favAdUpdated: false, promotions: true, myPromotions: false,
        },
      },
      isLoading: false,
    });
    render(<NotificationSettingsForm />);

    expect(screen.getByRole('switch', { name: 'رسائل جديدة' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('switch', { name: 'مشاهدات الإعلان' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'عروض وتخفيضات' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'عروضي' })).toHaveAttribute('aria-checked', 'false');
  });

  it('falls back to the documented defaults when the user has no saved preferences yet', () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { notificationPreferences: undefined },
      isLoading: false,
    });
    render(<NotificationSettingsForm />);

    expect(screen.getByRole('switch', { name: 'رسائل جديدة' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('switch', { name: 'مشاهدات الإعلان' })).toHaveAttribute('aria-checked', 'false');
    // PROMO-1: myPromotions defaults to true (opt-out), unlike the
    // admin-broadcast `promotions` key which defaults to false — a
    // store owner benefits from knowing about their own promotion
    // lifecycle by default; a marketplace newsletter shouldn't be
    // opt-out. See DEFAULT_PREFS's own comment in the component.
    expect(screen.getByRole('switch', { name: 'عروضي' })).toHaveAttribute('aria-checked', 'true');
  });

  it('toggling a switch flips it optimistically and persists only that one key (FEAT-02)', async () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { notificationPreferences: FULL_PREFS },
      isLoading: false,
    });
    const user = setupUser();
    render(<NotificationSettingsForm />);

    const adViewsSwitch = screen.getByRole('switch', { name: 'مشاهدات الإعلان' });
    expect(adViewsSwitch).toHaveAttribute('aria-checked', 'false');

    await user.click(adViewsSwitch);

    expect(adViewsSwitch).toHaveAttribute('aria-checked', 'true');
    // toggle() now also passes an onError rollback callback
    // alongside the payload, so a failed save reverts the switch instead
    // of leaving it visually "on" forever.
    expect(mockMutate).toHaveBeenCalledWith(
      { adViews: true },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
    // Only the toggled key is sent — a partial update, not the whole object.
    expect(mockMutate).toHaveBeenCalledTimes(1);
    expect(mockMutate.mock.calls[0][0]).toEqual({ adViews: true });
  });

  it('toggling an already-true switch flips it to false and persists that', async () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { notificationPreferences: FULL_PREFS },
      isLoading: false,
    });
    const user = setupUser();
    render(<NotificationSettingsForm />);

    await user.click(screen.getByRole('switch', { name: 'رسائل جديدة' }));

    expect(mockMutate).toHaveBeenCalledWith(
      { newMessage: false },
      expect.objectContaining({ onError: expect.any(Function) }),
    );
  });

  it('disables only the switch currently being toggled, not the others (UX-FIX P3-12)', async () => {
    const user = setupUser();
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { notificationPreferences: FULL_PREFS },
      isLoading: false,
    });
    // The mutation never settles in this test, so pendingKey stays set
    // on whichever switch was clicked — long enough to assert on.
    (useUpdateNotificationPreferences as ReturnType<typeof vi.fn>).mockReturnValue({
      mutate: mockMutate,
      isPending: true,
    });
    render(<NotificationSettingsForm />);

    await user.click(screen.getByRole('switch', { name: 'رسائل جديدة' }));

    expect(screen.getByRole('switch', { name: 'رسائل جديدة' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'مشاهدات الإعلان' })).not.toBeDisabled();
    expect(screen.getByRole('switch', { name: 'تحديثات المفضلة' })).not.toBeDisabled();
    expect(screen.getByRole('switch', { name: 'عروض وتخفيضات' })).not.toBeDisabled();
    expect(screen.getByRole('switch', { name: 'عروضي' })).not.toBeDisabled();
    expect(screen.getByRole('switch', { name: 'البحث المحفوظ' })).not.toBeDisabled();
    expect(screen.getByRole('switch', { name: 'تحديثات المتاجر' })).not.toBeDisabled();
    expect(screen.getByRole('switch', { name: 'عروض أسعار الخدمات' })).not.toBeDisabled();
  });

  it('reverts the switch to its previous state when the save fails (UX-FIX P2-9)', async () => {
    (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
      data: { notificationPreferences: FULL_PREFS },
      isLoading: false,
    });
    // Simulate a failed save by invoking the onError callback the
    // component passes, the same way react-query would on rejection.
    mockMutate.mockImplementation((_payload, options) => {
      options?.onError?.(new Error('network error'));
    });
    const user = setupUser();
    render(<NotificationSettingsForm />);

    const adViewsSwitch = screen.getByRole('switch', { name: 'مشاهدات الإعلان' });
    expect(adViewsSwitch).toHaveAttribute('aria-checked', 'false');

    await user.click(adViewsSwitch);

    // Optimistically flips to true first, then reverts back to false
    // once onError fires — never left stuck in the wrong, unsaved state.
    expect(adViewsSwitch).toHaveAttribute('aria-checked', 'false');
  });

  // PROMO-1 (): the new myPromotions toggle follows the exact
  // same immediate-save/partial-update contract as every other switch
  // in this form — covered independently here rather than assumed from
  // the generic tests above.
  describe('myPromotions toggle', () => {
    it('toggling it off persists only that key', async () => {
      (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { notificationPreferences: FULL_PREFS },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationSettingsForm />);

      const myPromotionsSwitch = screen.getByRole('switch', { name: 'عروضي' });
      expect(myPromotionsSwitch).toHaveAttribute('aria-checked', 'true');

      await user.click(myPromotionsSwitch);

      expect(myPromotionsSwitch).toHaveAttribute('aria-checked', 'false');
      expect(mockMutate).toHaveBeenCalledWith(
        { myPromotions: false },
        expect.objectContaining({ onError: expect.any(Function) }),
      );
      expect(mockMutate).toHaveBeenCalledTimes(1);
    });

    it('does not affect the unrelated `promotions` (admin newsletter) key', async () => {
      (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { notificationPreferences: FULL_PREFS },
        isLoading: false,
      });
      const user = setupUser();
      render(<NotificationSettingsForm />);

      await user.click(screen.getByRole('switch', { name: 'عروضي' }));

      expect(screen.getByRole('switch', { name: 'عروض وتخفيضات' })).toHaveAttribute('aria-checked', 'false');
      expect(mockMutate.mock.calls[0][0]).toEqual({ myPromotions: false });
    });
  });

  describe('new preference toggles', () => {
    it('renders savedSearch, storeUpdates, and serviceQuotes switches', () => {
      (useMe as ReturnType<typeof vi.fn>).mockReturnValue({
        data: { notificationPreferences: FULL_PREFS },
        isLoading: false,
      });
      render(<NotificationSettingsForm />);

      expect(screen.getByRole('switch', { name: 'البحث المحفوظ' })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'تحديثات المتاجر' })).toBeInTheDocument();
      expect(screen.getByRole('switch', { name: 'عروض أسعار الخدمات' })).toBeInTheDocument();
    });
  });
});
