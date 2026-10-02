'use client';

/**
 * إدارة إذن إشعارات الجهاز (Web Push / Native FCM) مع عرض صريح
 * لحالة إذن النظام — خاصة عند الرفض الدائم (denied).
 */

import { useEffect, useState, useCallback } from 'react';
import { Bell, BellOff, AlertTriangle, Smartphone, Send } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import {
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
  isPushSupported,
  getBrowserNotificationPermission,
} from '@/lib/pwa';
import { isNativePlatform } from '@/lib/capacitor/platform';
import {
  NATIVE_FCM_TOKEN_STORAGE_KEY,
  getNativePushPermissionState,
  registerNativePush,
  unregisterNativePush,
} from '@/lib/capacitor/nativePush';
import { toast } from 'sonner';
import { notificationsApi } from '@/api/notifications.api';
import { parseApiError } from '@/lib/errorParser';
import { isStandaloneMode } from '@/lib/runtime/appMode';
import { getRawVapidPublicKey } from '@/lib/env';
import { secureGet, secureRemove, secureSet } from '@/lib/runtime/secureStorage';
import { isPushOptedOut, setPushOptedOut } from '@/lib/runtime/pushPreference';
import { cn } from '@/lib/utils';

type SubState = 'loading' | 'subscribed' | 'unsubscribed' | 'unsupported';
type PermState = 'granted' | 'denied' | 'default' | 'unsupported' | 'loading';

function isIosDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /iphone|ipad|ipod/i.test(window.navigator.userAgent);
}

export function PushNotificationToggle() {
  const [state, setState] = useState<SubState>('loading');
  const [permission, setPermission] = useState<PermState>('loading');
  const [isNative, setIsNative] = useState<boolean | null>(null);
  const hasVapidKey = Boolean(getRawVapidPublicKey());
  const [testing, setTesting] = useState(false);
  const [onIos, setOnIos] = useState(false);
  const [standalone, setStandalone] = useState(true);

  useEffect(() => {
    setOnIos(isIosDevice());
    try {
      setStandalone(isStandaloneMode());
    } catch {
      /* matchMedia unavailable (old WebView / test env) — keep default */
    }
  }, []);

  // NOTIF-UX-TEST-01: lets the user verify the whole chain (permission →
  // subscription → server → push service → SW) in one tap. "targeted" is
  // all we can know server-side; the banner itself is the real confirmation.
  const handleTest = async () => {
    setTesting(true);
    try {
      const res = await notificationsApi.sendTestPush();
      const devices = res.data.data?.devices ?? 0;
      if (devices === 0) {
        toast.error('لا يوجد جهاز مسجّل لحسابك. أوقف الإشعارات ثم فعّلها من جديد.');
      } else {
        toast.success('أُرسل إشعار تجريبي — إن لم يظهر خلال ثوانٍ تحقق من إعدادات النظام.');
      }
    } catch (err) {
      toast.error(parseApiError(err).message);
    } finally {
      setTesting(false);
    }
  };

  const refresh = useCallback(async () => {
    try {
      const native = await isNativePlatform();
      setIsNative(native);

      if (native) {
        const p = await getNativePushPermissionState();
        const mapped: PermState =
          p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'default';
        setPermission(mapped);
        // PUSH-OPTOUT-01: إذن النظام granted لا يعني أن المستخدم يريدها.
        const optedOut = await isPushOptedOut();
        setState(p === 'granted' && !optedOut ? 'subscribed' : 'unsubscribed');
        return;
      }

      setPermission(getBrowserNotificationPermission());

      if (!isPushSupported()) {
        setState('unsupported');
        return;
      }
      if (!hasVapidKey) {
        setState('unsupported');
        return;
      }
      setState(await getPushSubscriptionState());
    } catch {
      setState('unsupported');
      setPermission('unsupported');
    }
  }, [hasVapidKey]);

  useEffect(() => {
    let cancelled = false;
    void refresh()
      .then(() => {
        if (cancelled) return;
      })
      .catch((err) => {
        // UNHANDLED-CATCH-FIX
        console.warn('[push-toggle] initial refresh failed:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [refresh]);

  const handleToggle = async () => {
    setState('loading');
    try {
      if (isNative) {
        if (state === 'subscribed') {
          // PUSH-TOKEN-STORAGE-01: نفس مخزن nativePush.ts (secureStorage) —
          // كان هنا localStorage بينما التوكن يُحفظ في Preferences على النيتف،
          // فلا يُوجد التوكن ولا يُحذف من الخادم.
          const token = await secureGet(NATIVE_FCM_TOKEN_STORAGE_KEY);
          if (token) await unregisterNativePush(token);
          await secureRemove(NATIVE_FCM_TOKEN_STORAGE_KEY);
          await setPushOptedOut(true);
          setState('unsubscribed');
          // إذن النظام لم يتغيّر — لا نكتب 'default' هنا.
          toast.success('تم إيقاف إشعارات الجهاز');
        } else {
          const token = await registerNativePush();
          if (token) {
            // STORAGE-QUOTA-GUARD-01: setItem can throw (quota exceeded,
            // Safari private mode). The token is already registered with
            // the backend at this point — losing the local mirror only
            // affects a future unsubscribe-from-this-device attempt, not
            // the live push subscription. Never let it abort the flow.
            try {
              await secureSet(NATIVE_FCM_TOKEN_STORAGE_KEY, token);
            } catch (err) {
              console.warn('[push-toggle] native FCM token persist failed:', err);
            }
            await setPushOptedOut(false);
          }
          setState(token ? 'subscribed' : 'unsubscribed');
          setPermission(token ? 'granted' : 'denied');
          if (token) toast.success('تم تفعيل إشعارات الجهاز');
          else toast.error('لم يتم منح إذن الإشعارات');
        }
        return;
      }

      if (getBrowserNotificationPermission() === 'denied') {
        setPermission('denied');
        setState('unsubscribed');
        toast.error('الإذن مرفوض من إعدادات المتصفح — فعّله يدوياً ثم أعد المحاولة');
        return;
      }

      if (state === 'subscribed') {
        await unsubscribeFromPush();
        await setPushOptedOut(true);
        setState('unsubscribed');
        toast.success('تم إيقاف إشعارات الجهاز');
      } else {
        const success = await subscribeToPush();
        if (success) await setPushOptedOut(false);
        setPermission(getBrowserNotificationPermission());
        setState(success ? 'subscribed' : 'unsubscribed');
        if (success) toast.success('تم تفعيل إشعارات الجهاز');
        else toast.error('لم يتم منح إذن الإشعارات');
      }
    } catch {
      toast.error('تعذّر تحديث إعدادات الإشعارات');
      await refresh();
    }
  };

  if (state === 'unsupported' && onIos && !standalone && isNative === false) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-card p-4 text-sm text-muted-foreground">
        <Smartphone className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium text-foreground">فعّل الإشعارات على iPhone</p>
          <ol className="mt-2 list-decimal space-y-1 ps-4 text-xs leading-relaxed">
            <li>افتح الموقع في Safari ثم اضغط زر المشاركة.</li>
            <li>اختر «إضافة إلى الشاشة الرئيسية».</li>
            <li>افتح التطبيق من الشاشة الرئيسية وعد إلى هذه الصفحة.</li>
          </ol>
          <p className="mt-2 text-[11px]">
            iOS لا يسمح بإشعارات الدفع إلا للتطبيقات المضافة للشاشة الرئيسية (iOS 16.4 أو أحدث).
          </p>
        </div>
      </div>
    );
  }

  if (state === 'unsupported' || (isNative === false && !hasVapidKey)) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-border/80 bg-card p-4 text-sm text-muted-foreground">
        <BellOff className="mt-0.5 h-5 w-5 shrink-0" />
        <div>
          <p className="font-medium text-foreground">إشعارات الجهاز غير متاحة</p>
          <p className="mt-1 text-xs leading-relaxed">
            هذا المتصفح أو الجهاز لا يدعم إشعارات الدفع، أو لم يُضبط مفتاح VAPID بعد.
            إشعارات التطبيق داخل الموقع ما زالت تعمل حسب التفضيلات أدناه.
          </p>
        </div>
      </div>
    );
  }

  const isChecking = state === 'loading' || permission === 'loading';
  const isDenied = permission === 'denied';
  const isOn = state === 'subscribed';

  return (
    <div className="space-y-3">
      <div
        className={cn(
          'flex items-center justify-between gap-3 rounded-xl border p-4',
          isDenied && 'border-destructive/40 bg-destructive/5',
          isOn && !isDenied && 'border-primary/30 bg-primary/5',
        )}
      >
        <div className="flex items-start gap-3">
          {isOn && !isDenied ? (
            <Bell className="mt-0.5 h-5 w-5 text-primary" />
          ) : isDenied ? (
            <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" />
          ) : (
            <BellOff className="mt-0.5 h-5 w-5 text-muted-foreground" />
          )}
          <div>
            <p className="font-medium">إشعارات هذا الجهاز</p>
            <p className="mt-0.5 text-sm text-muted-foreground">
              {isChecking
                ? 'جارٍ التحقق…'
                : isDenied
                  ? 'مرفوضة من إعدادات المتصفح/النظام — لن تظهر إشعارات خارجية'
                  : isOn
                    ? 'مفعّلة — تصلك حتى والـPWA أو المتصفح مغلقان'
                    : 'غير مفعّلة على هذا الجهاز — فعّلها لاستلام التنبيهات فورًا'}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-1 text-[11px] text-muted-foreground">
              <Smartphone className="h-3 w-3" />
              {isNative ? 'تطبيق أصلي' : 'متصفح / PWA'}
              <span aria-hidden>·</span>
              إذن النظام:{' '}
              <span className="font-medium text-foreground/80">
                {permission === 'granted'
                  ? 'مسموح'
                  : permission === 'denied'
                    ? 'مرفوض'
                    : permission === 'default'
                      ? 'لم يُطلب بعد'
                      : '—'}
              </span>
            </p>
          </div>
        </div>
        <Button
          variant={isOn ? 'outline' : isDenied ? 'outline' : 'default'}
          size="sm"
          disabled={isChecking || isDenied}
          onClick={handleToggle}
        >
          {isChecking ? '…' : isOn ? 'إيقاف' : isDenied ? 'محظور' : 'تفعيل'}
        </Button>
      </div>

      {/* شرح قبل طلب الإذن: لا يظهر بعد الرفض ولا بعد التفعيل */}
      {!isChecking && !isOn && !isDenied && permission === 'default' && (
        <div className="rounded-xl border border-border/80 bg-muted/30 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-foreground">ماذا سيحدث عند الضغط على «تفعيل»؟</p>
          <ul className="mt-1.5 list-disc space-y-1 ps-4">
            <li>سيطلب {isNative ? 'النظام' : 'المتصفح'} إذنك مرة واحدة.</li>
            <li>لن نرسل إلا الأنواع التي تختارها في الخطوة التالية.</li>
            <li>يمكنك الإيقاف في أي وقت من هذه الصفحة.</li>
          </ul>
        </div>
      )}

      {isOn && !isDenied && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">تأكد أن الإشعارات تصل إلى هذا الجهاز.</p>
          <Button
            variant="outline"
            size="sm"
            disabled={testing}
            onClick={() => void handleTest()}
            className="gap-1.5"
          >
            <Send className="h-3.5 w-3.5 rtl:-scale-x-100" aria-hidden />
            {testing ? 'جارٍ الإرسال…' : 'إرسال إشعار تجريبي'}
          </Button>
        </div>
      )}

      {isDenied && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-destructive">كيف تعيد تفعيل الإذن؟</p>
          {onIos ? (
            <ol className="mt-2 list-decimal space-y-1 ps-4">
              <li>افتح تطبيق «الإعدادات» في iPhone ثم «الإشعارات».</li>
              <li>اختر هذا التطبيق (أو Safari) وفعّل «السماح بالإشعارات».</li>
              <li>ارجع إلى هنا واضغط «تفعيل».</li>
            </ol>
          ) : (
            <>
              <ol className="mt-2 list-decimal space-y-1 ps-4">
                <li>افتح إعدادات الموقع في المتصفح (أيقونة القفل أو الإعدادات بجانب الرابط).</li>
                <li>ابحث عن «الإشعارات» وغيّرها إلى «السماح».</li>
                <li>أعد تحميل الصفحة ثم اضغط «تفعيل».</li>
              </ol>
              <p className="mt-2 text-[11px]">
                على الجوال: إعدادات النظام → التطبيقات → المتصفح (أو التطبيق) → الإشعارات.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
