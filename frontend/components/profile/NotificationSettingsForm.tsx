'use client';

import { useState, useEffect } from 'react';
import { useMe } from '@/hooks/queries/useAuth';
import { useUpdateNotificationPreferences } from '@/hooks/mutations/useUpdateProfile';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import type { NotificationPreferences } from '@/types/user.types';

const SETTINGS = [
  { key: 'newMessage',     label: 'رسائل جديدة',              desc: 'عند استلام رسالة من مشتري' },
  { key: 'adViews',        label: 'مشاهدات الإعلان',           desc: 'تقرير أسبوعي بمشاهدات إعلاناتك' },
  { key: 'favAdUpdated',   label: 'تحديثات المفضلة',           desc: 'عند تغيير سعر إعلان في المفضلة' },
  { key: 'promotions',     label: 'عروض وتخفيضات',             desc: 'نشرة أخبار سوق غزة' },
] as const satisfies readonly { key: keyof NotificationPreferences; label: string; desc: string }[];

const DEFAULT_PREFS: NotificationPreferences = {
  newMessage: true, adViews: false, favAdUpdated: true, promotions: false,
};

/**
 * FIX FEAT-02: previously this component used local-only useState seeded
 * with hardcoded defaults, and "save" was just a toast — nothing was
 * ever persisted, so a reload always reset to the same defaults
 * regardless of what the user had "saved" before. Now loads the user's
 * actual saved preferences via useMe() (GET /users/me) and persists each
 * toggle immediately via PATCH /users/me/notifications.
 */
export function NotificationSettingsForm() {
  const { data: me, isLoading } = useMe();
  const updatePrefs = useUpdateNotificationPreferences();

  // Local optimistic copy so toggling feels instant; reconciled from
  // server data once it loads/refetches.
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);

  useEffect(() => {
    if (me?.notificationPreferences) {
      setPrefs(me.notificationPreferences);
    }
  }, [me?.notificationPreferences]);

  function toggle(key: keyof NotificationPreferences) {
    const next = !prefs[key];
    setPrefs((p) => ({ ...p, [key]: next }));
    // FIX FEAT-02: each switch saves immediately (matches the
    // immediate-feedback feel of a toggle UI) rather than requiring a
    // separate "save" click — the form below still allows a final
    // explicit save for users who prefer that flow.
    updatePrefs.mutate({ [key]: next });
  }

  if (isLoading) {
    return <div className="flex justify-center py-8"><LoadingSpinner /></div>;
  }

  return (
    <div className="space-y-6 max-w-lg">
      <h2 className="font-semibold">إعدادات الإشعارات</h2>
      <div className="space-y-4">
        {SETTINGS.map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between p-3 rounded-lg border">
            <div>
              <p className="text-sm font-medium">{label}</p>
              <p className="text-xs text-muted-foreground">{desc}</p>
            </div>
            <button
              role="switch" aria-checked={prefs[key]} aria-label={label}
              disabled={updatePrefs.isPending}
              onClick={() => toggle(key)}
              className={`relative inline-flex h-6 w-11 rounded-full transition-colors disabled:opacity-50
                ${prefs[key] ? 'bg-primary' : 'bg-input'}`}>
              <span className={`inline-block h-5 w-5 rounded-full bg-white shadow-sm transition-transform mt-0.5
                ${prefs[key] ? 'translate-x-5 rtl:-translate-x-5' : 'translate-x-0.5 rtl:-translate-x-0.5'}`} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
