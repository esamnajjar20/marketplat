'use client';

/**
 * PHASE-B: شاشة إعدادات إشعارات موحّدة —
 * 1) إذن الجهاز (Web Push / FCM)
 * 2) ماذا يصلك (تفضيلات المحتوى)
 * 3) متى يصلك (ساعات الهدوء)
 *
 * يُعرض من تبويب الإعدادات → الإشعارات كمصدر وحيد للتجربة.
 */

import { useState, useEffect } from 'react';
import { Loader2, Check, X, Smartphone, ListChecks, Moon } from 'lucide-react';
import { useMe } from '@/hooks/queries/useAuth';
import { useUpdateNotificationPreferences } from '@/hooks/mutations/useUpdateProfile';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Button } from '@/components/shared/ui/Button';
import { PushNotificationToggle } from '@/components/pwa/PushNotificationToggle';
import type { NotificationPreferences } from '@/types/user.types';
import { cn } from '@/lib/utils';

type PrefKey = keyof NotificationPreferences;
type BooleanPrefKey =
  | 'newMessage'
  | 'adViews'
  | 'favAdUpdated'
  | 'promotions'
  | 'myPromotions'
  | 'savedSearch'
  | 'storeUpdates'
  | 'serviceQuotes';

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
        desc: 'نشرة أخبار وعروض المنصة',
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
        desc: 'عند وصول طلب خدمة أو تغيّر حالته أو حجز موعد، وعند استلام عرض أو قبوله',
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

function SectionHeading({
  step,
  icon: Icon,
  title,
  subtitle,
}: {
  step: number;
  icon: typeof Smartphone;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        <Icon className="h-4 w-4" aria-hidden />
      </div>
      <div className="min-w-0">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          الخطوة {step}
        </p>
        <h2 className="text-base font-semibold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
      </div>
    </div>
  );
}

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
    <div className="space-y-10">
      {/* ─── 1 · الجهاز ─── */}
      <section className="space-y-4" aria-labelledby="notif-device-heading">
        <div id="notif-device-heading">
          <SectionHeading
            step={1}
            icon={Smartphone}
            title="إشعارات هذا الجهاز"
            subtitle="هل تريد أن يصل التنبيه للجوال أو المتصفح حتى وأنت خارج الموقع؟ هذا منفصل عن أنواع المحتوى أدناه."
          />
        </div>
        <PushNotificationToggle />
      </section>

      {/* ─── 2 · المحتوى ─── */}
      <section className="space-y-4" aria-labelledby="notif-content-heading">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div id="notif-content-heading">
            <SectionHeading
              step={2}
              icon={ListChecks}
              title="ماذا يصلك؟"
              subtitle={`أنواع التنبيهات داخل التطبيق وعلى الجهاز معاً · ${enabledCount}/${totalCount} مفعّل`}
            />
          </div>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={bulkPending}
              onClick={() => setAll(true)}
            >
              تفعيل الكل
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={bulkPending}
              onClick={() => setAll(false)}
            >
              إيقاف الكل
            </Button>
          </div>
        </div>

        <div className="space-y-5">
          {GROUPS.map((group) => (
            <div key={group.title} className="space-y-2">
              <div>
                <h3 className="text-sm font-semibold">{group.title}</h3>
                <p className="text-xs text-muted-foreground">{group.description}</p>
              </div>
              <div className="overflow-hidden rounded-xl border border-border/80 divide-y">
                {group.items.map(({ key, label, desc }) => {
                  const on = Boolean(prefs[key]);
                  const busy = pendingKey === key || bulkPending;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 bg-card px-3 py-3 sm:px-4"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-medium">{label}</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {busy ? (
                          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                        ) : on ? (
                          <Check className="h-4 w-4 text-primary" aria-hidden />
                        ) : (
                          <X className="h-4 w-4 text-muted-foreground/50" aria-hidden />
                        )}
                        <button
                          type="button"
                          role="switch"
                          aria-checked={on}
                          aria-label={label}
                          disabled={busy}
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
            </div>
          ))}
        </div>
      </section>

      {/* ─── 3 · التوقيت ─── */}
      <section className="space-y-4" aria-labelledby="notif-timing-heading">
        <div id="notif-timing-heading">
          <SectionHeading
            step={3}
            icon={Moon}
            title="متى يصلك؟"
            subtitle="ساعات الهدوء توقف إشعارات الجهاز في الليل. الإشعارات داخل التطبيق تُحفظ وتظهر عند فتحك للمنصة."
          />
        </div>

        <div className="overflow-hidden rounded-xl border border-border/80 divide-y">
          <div className="flex items-center justify-between gap-3 bg-card px-3 py-3 sm:px-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">ساعات الهدوء</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                لا تُرسل إشعارات للجهاز بين الوقتين أدناه (ما عدا العاجل إن سمحت)
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
                  <p className="text-sm font-medium">السماح بالعاجل أثناء الهدوء</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    رسائل جديدة (وأحداث عاجلة مشابهة) تصل حتى في ساعات الهدوء
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={prefs.quietHoursAllowUrgent !== false}
                  aria-label="السماح بالعاجل أثناء الهدوء"
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
