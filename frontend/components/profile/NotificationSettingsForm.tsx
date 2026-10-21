'use client';

/**
 * شاشة إعدادات إشعارات موحّدة —
 * 1) إذن الجهاز (Web Push / FCM)
 * 2) ماذا يصلك (تفضيلات المحتوى)
 * 3) متى يصلك (ساعات الهدوء)
 *
 * يُعرض من تبويب الإعدادات → الإشعارات كمصدر وحيد للتجربة.
 */

import { useState, useEffect } from 'react';
import { Smartphone, ListChecks, Moon } from 'lucide-react';
import { useMe } from '@/hooks/queries/useAuth';
import { useUpdateNotificationPreferences } from '@/hooks/mutations/useUpdateProfile';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Button } from '@/components/shared/ui/Button';
import { PushNotificationToggle } from '@/components/pwa/PushNotificationToggle';
import { NotificationDevicesList } from '@/components/pwa/NotificationDevicesList';
import type { NotificationPreferences } from '@/types/user.types';
import { cn } from '@/lib/utils';

import { Spinner } from '@/components/ui/spinner';
type PrefKey = keyof NotificationPreferences;
type BooleanPrefKey =
  | 'newMessage'
  | 'adViews'
  | 'favAdUpdated'
  | 'promotions'
  | 'myPromotions'
  | 'savedSearch'
  | 'storeUpdates'
  | 'followUpdates'
  | 'serviceQuotes'
  | 'salesAlerts'
  | 'lowStockAlerts'
  | 'installmentAlerts'
  | 'debtAlerts'
  | 'weeklySalesReport';

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
      { key: 'followUpdates', label: 'تحديثات المتابعة', desc: 'عندما يبدأ شخص بمتابعتك أو ينشر شخص/متجر/فئة تتابعها محتوى جديدًا' },
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
    title: 'المبيعات والمخزون',
    description: 'تنبيهات تساعدك على متابعة نشاطك التجاري',
    items: [
      { key: 'salesAlerts', label: 'تذكير المبيعات', desc: 'تذكير إذا لم تسجل مبيعات في اليوم' },
      { key: 'lowStockAlerts', label: 'انخفاض المخزون', desc: 'عند وصول مخزون منتج إلى حد منخفض' },
      { key: 'installmentAlerts', label: 'الأقساط المتأخرة', desc: 'عند تأخر قسط على عميل' },
      { key: 'debtAlerts', label: 'الديون', desc: 'عند استمرار دين العميل لفترة طويلة' },
      { key: 'weeklySalesReport', label: 'تقرير المبيعات الأسبوعي', desc: 'ملخص أسبوعي للمبيعات والإيرادات' },
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
  followUpdates: true,
  serviceQuotes: true,
  salesAlerts: true,
  lowStockAlerts: true,
  installmentAlerts: true,
  debtAlerts: true,
  weeklySalesReport: true,
  emailFallback: false,
  quietHoursEnabled: false,
  quietHoursStart: '22:00',
  quietHoursEnd: '08:00',
  quietHoursAllowUrgent: true,
};

/** Matches the server fallback in pushService.resolveQuietTimeZone. */
const DEFAULT_QUIET_TIME_ZONE = 'Asia/Gaza';

function getDeviceTimeZone(): string | null {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || null;
  } catch {
    return null;
  }
}

function SectionHeading({
  icon: Icon,
  title,
  subtitle,
}: {
  icon: typeof Smartphone;
  title: string;
  subtitle: string;
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0 text-end sm:text-start">
        <h2 className="text-base font-bold text-foreground">{title}</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{subtitle}</p>
      </div>
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
        <Icon className="h-5 w-5" aria-hidden />
      </div>
    </div>
  );
}

/** Shared preference row toggle matching design (green pill switch). */
function PrefSwitch({
  on,
  busy,
  label,
  onToggle,
}: {
  on: boolean;
  busy?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <div className="flex shrink-0 items-center gap-2">
      {busy ? <Spinner size="sm" className="text-muted-foreground" /> : null}
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={label}
        disabled={busy}
        onClick={onToggle}
        className={cn(
          'relative inline-flex h-7 w-12 rounded-full transition-colors disabled:opacity-50',
          on ? 'bg-primary' : 'bg-input',
        )}
      >
        <span
          className={cn(
            'absolute top-0.5 h-6 w-6 rounded-full bg-background shadow transition-transform',
            on ? 'start-[1.375rem]' : 'start-0.5',
          )}
        />
      </button>
    </div>
  );
}

export function NotificationSettingsForm() {
  const { data: me, isLoading } = useMe();
  // NOTIF-PREFS-UX-01: one inline status instead of a toast per switch.
  const updatePrefs = useUpdateNotificationPreferences({ silent: true });
  const isSaving = (updatePrefs.pendingCount ?? 0) > 0;
  const justSaved = Boolean(updatePrefs.justSaved) && !isSaving;
  const deviceTimeZone = getDeviceTimeZone();
  const [prefs, setPrefs] = useState<NotificationPreferences>(DEFAULT_PREFS);
  const [pendingKey, setPendingKey] = useState<PrefKey | null>(null);
  const [bulkPending, setBulkPending] = useState(false);
  const quietTimeZone = prefs.quietHoursTimeZone ?? DEFAULT_QUIET_TIME_ZONE;

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
    <div className="mx-auto max-w-lg space-y-3">
      {/* ─── 1 · الجهاز ─── */}
      <section
        className="space-y-3 rounded-2xl border border-border/70 bg-card p-4 shadow-xs sm:p-5"
        aria-labelledby="notif-device-heading"
      >
        <div id="notif-device-heading">
          <SectionHeading
            icon={Smartphone}
            title="هذا الجهاز"
            subtitle="إشعارات الدفع على هذا الجهاز"
          />
        </div>
        <PushNotificationToggle />
        <NotificationDevicesList />
      </section>

      {/* ─── 2 · المحتوى ─── */}
      <section className="space-y-3" aria-labelledby="notif-content-heading">
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-xs">
          <div id="notif-content-heading" className="min-w-0">
            <p className="text-sm font-bold text-foreground">تفضيلات المحتوى</p>
            <p className="text-xs text-muted-foreground">
              {enabledCount}/{totalCount} مفعّل
              {isSaving ? ' · جارٍ الحفظ…' : justSaved ? ' · تم الحفظ ✓' : ''}
            </p>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 rounded-xl text-xs font-bold"
              disabled={bulkPending}
              onClick={() => setAll(true)}
            >
              تفعيل الكل
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 rounded-xl text-xs font-bold"
              disabled={bulkPending}
              onClick={() => setAll(false)}
            >
              إيقاف الكل
            </Button>
          </div>
        </div>

        <div className="space-y-3">
          {GROUPS.map((group) => (
            <div
              key={group.title}
              className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs"
            >
              <div className="flex items-start justify-between gap-3 border-b border-border/50 px-4 py-3">
                <div className="min-w-0 text-end sm:text-start">
                  <h3 className="text-sm font-bold text-foreground">{group.title}</h3>
                  <p className="text-xs text-muted-foreground">{group.description}</p>
                </div>
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
                  <ListChecks className="h-4 w-4" aria-hidden />
                </div>
              </div>
              <div className="divide-y divide-border/60">
                {group.items.map(({ key, label, desc }) => {
                  const on = Boolean(prefs[key]);
                  const busy = pendingKey === key || bulkPending;
                  return (
                    <div
                      key={key}
                      className="flex items-center justify-between gap-3 px-4 py-3.5"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-foreground">{label}</p>
                        <p className="text-xs leading-relaxed text-muted-foreground">{desc}</p>
                      </div>
                      <PrefSwitch
                        on={on}
                        busy={busy}
                        label={label}
                        onToggle={() => toggle(key)}
                      />
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ─── 3 · التوقيت ─── */}
      <section className="space-y-3" aria-labelledby="notif-timing-heading">
        <div
          id="notif-timing-heading"
          className="rounded-2xl border border-border/70 bg-card p-4 shadow-xs sm:p-5"
        >
          <SectionHeading
            icon={Moon}
            title="متى يصلك؟"
            subtitle="ساعات الهدوء وتفضيلات التوقيت — الإشعارات داخل التطبيق تُحفظ وتظهر عند فتح المنصة."
          />
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <p id="email-fallback-label" className="text-sm font-bold">
                تنبيه بالبريد عند عدم القراءة
              </p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                إن بقيت رسائلك أو طلباتك أو عروضك غير مقروءة نصف ساعة تقريباً، نرسل لك بريداً واحداً ملخّصاً (بحد أقصى مرة كل ساعة)
              </p>
            </div>
            <PrefSwitch
              on={Boolean(prefs.emailFallback)}
              busy={bulkPending}
              label="تنبيه بالبريد عند عدم القراءة"
              onToggle={() => {
                const next = !prefs.emailFallback;
                setPrefs((p) => ({ ...p, emailFallback: next }));
                updatePrefs.mutate(
                  { emailFallback: next },
                  { onError: () => setPrefs((p) => ({ ...p, emailFallback: !next })) },
                );
              }}
            />
          </div>
        </div>

        <div className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-xs divide-y divide-border/60">
          <div className="flex items-center justify-between gap-3 px-4 py-3.5">
            <div className="min-w-0">
              <p className="text-sm font-bold">ساعات الهدوء</p>
              <p className="text-xs leading-relaxed text-muted-foreground">
                لا تصلك إشعارات الجهاز بين الوقتين أدناه (ما عدا العاجل إن سمحت)
              </p>
            </div>
            <PrefSwitch
              on={Boolean(prefs.quietHoursEnabled)}
              busy={bulkPending}
              label="ساعات الهدوء"
              onToggle={() => {
                const next = !prefs.quietHoursEnabled;
                // First enable: pin the window to this device's zone so "22:00"
                // means the user's 22:00, not the server's.
                const pinZone = next && !prefs.quietHoursTimeZone && deviceTimeZone;
                const patch: Partial<NotificationPreferences> = pinZone
                  ? { quietHoursEnabled: next, quietHoursTimeZone: deviceTimeZone }
                  : { quietHoursEnabled: next };
                setPrefs((p) => ({ ...p, ...patch }));
                updatePrefs.mutate(patch);
              }}
            />
          </div>

          {prefs.quietHoursEnabled && (
            <>
              <div className="flex flex-wrap items-center gap-3 px-4 py-3.5">
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
                    className="h-10 rounded-xl border bg-background px-3 py-2 text-sm"
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
                    className="h-10 rounded-xl border bg-background px-3 py-2 text-sm"
                  />
                </label>
              </div>
              <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 text-xs text-muted-foreground">
                <span>
                  التوقيت المعتمد: <bdi className="font-medium text-foreground/80">{quietTimeZone}</bdi>
                </span>
                {deviceTimeZone && deviceTimeZone !== quietTimeZone && (
                  <button
                    type="button"
                    className="font-medium text-primary underline-offset-2 hover:underline"
                    onClick={() => {
                      setPrefs((p) => ({ ...p, quietHoursTimeZone: deviceTimeZone }));
                      updatePrefs.mutate({ quietHoursTimeZone: deviceTimeZone });
                    }}
                  >
                    استخدم توقيت جهازي ({deviceTimeZone})
                  </button>
                )}
              </div>
              <div className="flex items-center justify-between gap-3 px-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-bold">السماح بالعاجل أثناء الهدوء</p>
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    رسائل جديدة (وأحداث عاجلة مشابهة) تصل حتى في ساعات الهدوء
                  </p>
                </div>
                <PrefSwitch
                  on={prefs.quietHoursAllowUrgent !== false}
                  busy={bulkPending}
                  label="السماح بالعاجل أثناء الهدوء"
                  onToggle={() => {
                    const next = prefs.quietHoursAllowUrgent === false;
                    setPrefs((p) => ({ ...p, quietHoursAllowUrgent: next }));
                    updatePrefs.mutate({ quietHoursAllowUrgent: next });
                  }}
                />
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  );
}
