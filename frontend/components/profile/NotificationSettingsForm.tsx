'use client';

import { useState, useEffect } from 'react';
import { Loader2, Check, X } from 'lucide-react';
import { useMe } from '@/hooks/queries/useAuth';
import { useUpdateNotificationPreferences } from '@/hooks/mutations/useUpdateProfile';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Button } from '@/components/shared/ui/Button';
import type { NotificationPreferences } from '@/types/user.types';
import { cn } from '@/lib/utils';

type PrefKey = keyof NotificationPreferences;
type BooleanPrefKey = 'newMessage' | 'adViews' | 'favAdUpdated' | 'promotions' | 'myPromotions' | 'savedSearch' | 'storeUpdates' | 'serviceQuotes';

const GROUPS: {
  title: string;
  description: string;
  items: { key: BooleanPrefKey; label: string; desc: string }[];
}[] = [
  {
    title: 'التواصل',
    description: 'رسائل ومحادثات المشترين',
    items: [
      { key: 'newMessage', label: 'رسائل جديدة', desc: 'عند استلام رسالة من مشتري أو بائع' },
    ],
  },
  {
    title: 'المفضلة والبحث',
    description: 'تحديثات ما تتابعه',
    items: [
      {
        key: 'favAdUpdated',
        label: 'تحديثات المفضلة',
        desc: 'عند تغيير سعر إعلان في المفضلة أو بيعه',
      },
      {
        key: 'savedSearch',
        label: 'البحث المحفوظ',
        desc: 'عند ظهور إعلان أو منتج أو خدمة تطابق بحثك',
      },
    ],
  },
  {
    title: 'المتاجر والعروض',
    description: 'متاجر تتابعها وعروضك أنت',
    items: [
      {
        key: 'storeUpdates',
        label: 'تحديثات المتاجر',
        desc: 'منتجات وعروض وإعادة توفّر من متاجر تتابعها',
      },
      {
        key: 'myPromotions',
        label: 'عروضي',
        desc: 'عند بدء أو قرب انتهاء أو انتهاء عرض على أحد منتجاتك',
      },
      {
        key: 'promotions',
        label: 'عروض وتخفيضات المنصة',
        desc: 'نشرة أخبار وعروض سوق غزة',
      },
    ],
  },
  {
    title: 'الخدمات',
    description: 'عروض الأسعار وطلبات الخدمة',
    items: [
      {
        key: 'serviceQuotes',
        label: 'عروض أسعار الخدمات',
        desc: 'عند استلام عرض سعر أو قبول عرضك',
      },
    ],
  },
  {
    title: 'تقارير البائع',
    description: 'إحصائيات دورية',
    items: [
      {
        key: 'adViews',
        label: 'مشاهدات الإعلان',
        desc: 'تقرير أسبوعي بمشاهدات إعلاناتك',
      },
    ],
  },
];

const DEFAULT_PREFS: NotificationPreferences = {
  newMessage: true,
  adViews: false,
  favAdUpdated: true,
  promotions: false,
  myPromotions: true,
  savedSearch: true,
  storeUpdates: true,
  serviceQuotes: true,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  quietHoursAllowUrgent: true,
};

export function NotificationSettingsForm() {
  const { data: me, isLoading } = useMe();
  const updatePrefs = useUpdateNotificationPreferences();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [pendingKey, setPendingKey] = useState<PrefKey | null>(null);
  const [bulkPending, setBulkPending] = useState(false);

  useEffect(() => {
    if (me?.notificationPreferences) {
      setPrefs({ ...DEFAULT_PREFS, ...me.notificationPreferences });
    }
  }, [me?.notificationPreferences]);

  function applyKey(key: PrefKey, next: boolean) {
    setPrefs((p) => ({ ...p, [key]: next }));
    setPendingKey(key);
    updatePrefs.mutate(
      { [key]: next },
      {
        onError: () => setPrefs((p) => ({ ...p, [key]: !next })),
        onSettled: () => setPendingKey(null),
      },
    );
  }

  function toggle(key: PrefKey) {
    applyKey(key, !prefs[key]);
  }

  async function setAll(value: boolean) {
    const patch: Partial<Record<BooleanPrefKey, boolean>> = {};
    for (const g of GROUPS) {
      for (const item of g.items) {
        if (prefs[item.key] !== value) patch[item.key] = value;
      }
    }
    if (Object.keys(patch).length === 0) return;
    setBulkPending(true);
    const prev = { ...prefs };
    setPrefs((p) => ({ ...p, ...patch }));
    updatePrefs.mutate(patch, {
      onError: () => setPrefs(prev),
      onSettled: () => setBulkPending(false),
    });
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  const enabledCount = GROUPS.flatMap((g) => g.items).filter((i) => prefs[i.key]).length;
  const totalCount = GROUPS.flatMap((g) => g.items).length;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-semibold">أذونات وأنواع الإشعارات</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            تطبَّق على إشعارات داخل التطبيق وعلى الجهاز (Web Push) معًا ·{' '}
            {enabledCount}/{totalCount} مفعّل
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={bulkPending}
            onClick={() => setAll(true)}
            className="gap-1"
          >
            {bulkPending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
            تفعيل الكل
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={bulkPending}
            onClick={() => setAll(false)}
            className="gap-1 text-muted-foreground"
          >
            <X className="h-3 w-3" />
            إيقاف الكل
          </Button>
        </div>
      </div>

      <div className="space-y-5">
        {GROUPS.map((group) => (
          <section key={group.title} className="space-y-2">
            <div className="px-0.5">
              <h3 className="text-sm font-semibold">{group.title}</h3>
              <p className="text-[11px] text-muted-foreground">{group.description}</p>
            </div>
            <div className="overflow-hidden rounded-xl border divide-y">
              {group.items.map(({ key, label, desc }) => {
                const on = Boolean(prefs[key]);
                const pending = pendingKey === key;
                return (
                  <div
                    key={key}
                    className="flex items-center justify-between gap-3 bg-card px-3 py-3 sm:px-4"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{label}</p>
                      <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {pending && (
                        <span className="flex items-center gap-1 text-xs text-muted-foreground">
                          <Loader2 className="h-3 w-3 animate-spin" />
                        </span>
                      )}
                      <button
                        type="button"
                        role="switch"
                        aria-checked={on}
                        aria-label={label}
                        disabled={pending || bulkPending}
                        onClick={() => toggle(key)}
                        className={cn(
                          'relative inline-flex h-6 w-11 rounded-full transition-colors disabled:opacity-50',
                          on ? 'bg-primary' : 'bg-input',
                        )}
                      >
                        <span
                          className={cn(
                            'absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform',
                            on ? 'start-[1.375rem]' : 'start-0.5',
                          )}
                        />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      {/* Quiet hours — external device push only */}
      <section className="space-y-2">
        <div className="px-0.5">
          <h3 className="text-sm font-semibold">ساعات الهدوء</h3>
          <p className="text-[11px] text-muted-foreground">
            إيقاف إشعارات الجهاز في فترة محددة (توقيت فلسطين). إشعارات داخل التطبيق تبقى كما هي.
          </p>
        </div>
        <div className="overflow-hidden rounded-xl border divide-y">
          <div className="flex items-center justify-between gap-3 bg-card px-3 py-3 sm:px-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">تفعيل ساعات الهدوء</p>
              <p className="text-xs text-muted-foreground leading-relaxed">
                لا تُرسل تنبيهات للجهاز بين الساعتين أدناه
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={Boolean(prefs.quietHoursEnabled)}
              aria-label="ساعات الهدوء"
              disabled={bulkPending}
              onClick={() => {
                const next = !prefs.quietHoursEnabled;
                setPrefs((p) => ({ ...p, quietHoursEnabled: next }));
                updatePrefs.mutate({ quietHoursEnabled: next });
              }}
              className={cn(
                'relative inline-flex h-6 w-11 rounded-full transition-colors disabled:opacity-50',
                prefs.quietHoursEnabled ? 'bg-primary' : 'bg-input',
              )}
            >
              <span
                className={cn(
                  'absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform',
                  prefs.quietHoursEnabled ? 'start-[1.375rem]' : 'start-0.5',
                )}
              />
            </button>
          </div>
          {prefs.quietHoursEnabled && (
            <>
              <div className="flex flex-wrap items-center gap-3 bg-card px-3 py-3 sm:px-4">
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">من</span>
                  <input
                    type="time"
                    value={prefs.quietHoursStart ?? '22:00'}
                    onChange={(e) => {
                      const quietHoursStart = e.target.value || '22:00';
                      setPrefs((p) => ({ ...p, quietHoursStart }));
                      updatePrefs.mutate({ quietHoursStart });
                    }}
                    className="rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </label>
                <label className="flex flex-col gap-1 text-xs">
                  <span className="text-muted-foreground">إلى</span>
                  <input
                    type="time"
                    value={prefs.quietHoursEnd ?? '08:00'}
                    onChange={(e) => {
                      const quietHoursEnd = e.target.value || '08:00';
                      setPrefs((p) => ({ ...p, quietHoursEnd }));
                      updatePrefs.mutate({ quietHoursEnd });
                    }}
                    className="rounded-md border bg-background px-2 py-1.5 text-sm"
                  />
                </label>
              </div>
              <div className="flex items-center justify-between gap-3 bg-card px-3 py-3 sm:px-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium">السماح بالرسائل العاجلة</p>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    إشعارات الرسائل الجديدة تصل حتى أثناء ساعات الهدوء
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.quietHoursAllowUrgent !== false}
                  aria-label="السماح بالرسائل العاجلة"
                  disabled={bulkPending}
                  onClick={() => {
                    const next = prefs.quietHoursAllowUrgent === false;
                    setPrefs((p) => ({ ...p, quietHoursAllowUrgent: next }));
                    updatePrefs.mutate({ quietHoursAllowUrgent: next });
                  }}
                  className={cn(
                    'relative inline-flex h-6 w-11 rounded-full transition-colors disabled:opacity-50',
                    prefs.quietHoursAllowUrgent !== false ? 'bg-primary' : 'bg-input',
                  )}
                >
                  <span
                    className={cn(
                      'absolute top-0.5 h-5 w-5 rounded-full bg-background shadow transition-transform',
                      prefs.quietHoursAllowUrgent !== false ? 'start-[1.375rem]' : 'start-0.5',
                    )}
                  />
                </button>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
