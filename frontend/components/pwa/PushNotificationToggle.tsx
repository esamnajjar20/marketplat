/**
 * مفتاح تفعيل/إلغاء إشعارات Push — يُستخدم داخل /settings/notifications.
 *
 * ⚠️ يتطلب تفعيلًا فعليًا:
 *   1. متغير بيئة NEXT_PUBLIC_VAPID_PUBLIC_KEY (مفتاح VAPID العام).
 *   2. نقطة باك-إند POST/DELETE على /notifications/push-subscriptions
 *      (غير موجودة حاليًا — راجع قسم المتطلبات المتبقية في التسليم).
 * قبل توفر الاثنين، هذا المكوّن يعرض حالة "غير مدعوم حاليًا" بدل كسر الصفحة.
 */
'use client';

import { useEffect, useState } from 'react';
import { Bell, BellOff } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import {
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
  isPushSupported,
} from '@/lib/pwa';
import { isNativePlatform } from '@/lib/capacitor/platform';
import {
  getNativePushPermissionState,
  registerNativePush,
  unregisterNativePush,
} from '@/lib/capacitor/nativePush';
import { toast } from 'sonner';

// WIRING: the native (FCM) path has its own backend endpoint
// (/notifications/fcm-tokens, already implemented — see
// lib/capacitor/nativePush.ts) and needs no VAPID key, unlike the web
// path below. Persisted locally only to pass back to
// unregisterNativePush() — this module doesn't track it server-side.
const NATIVE_TOKEN_STORAGE_KEY = 'push:native-fcm-token';

export function PushNotificationToggle() {
  const [state, setState] = useState<'subscribed' | 'unsubscribed' | 'unsupported' | 'loading'>(
    'loading',
  );
  const [isNative, setIsNative] = useState<boolean | null>(null);
  const hasVapidKey = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

  useEffect(() => {
    let cancelled = false;

    isNativePlatform().then((native) => {
      if (cancelled) return;
      setIsNative(native);

      if (native) {
        // Native shell: no VAPID key needed, no isPushSupported() check
        // (that one tests for the Web Push/ServiceWorker API only).
        getNativePushPermissionState()
          .then((permission) =>
            setState(permission === 'granted' ? 'subscribed' : 'unsubscribed'),
          )
          .catch(() => setState('unsupported'));
        return;
      }

      if (!isPushSupported()) {
        setState('unsupported');
        return;
      }
      // FIX ESLINT-06: previously `getPushSubscriptionState().then(setState)`
      // with no error handling — a floating promise (now caught by
      // no-floating-promises now that eslint.config.mjs has type info to
      // run that rule at all). If the promise ever rejects (e.g. the
      // Notification/PushManager API throws inside the async function),
      // it becomes an unhandled rejection instead of just leaving the
      // toggle stuck on 'loading'. Falls back to 'unsupported' on error,
      // same as the already-handled !isPushSupported() branch above.
      getPushSubscriptionState()
        .then(setState)
        .catch(() => setState('unsupported'));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleToggle = async () => {
    setState('loading');
    try {
      if (isNative) {
        if (state === 'subscribed') {
          const token = window.localStorage.getItem(NATIVE_TOKEN_STORAGE_KEY);
          if (token) await unregisterNativePush(token);
          window.localStorage.removeItem(NATIVE_TOKEN_STORAGE_KEY);
          setState('unsubscribed');
          toast.success('تم إيقاف إشعارات الجهاز');
        } else {
          const token = await registerNativePush();
          if (token) window.localStorage.setItem(NATIVE_TOKEN_STORAGE_KEY, token);
          setState(token ? 'subscribed' : 'unsubscribed');
          if (token) toast.success('تم تفعيل إشعارات الجهاز');
          else toast.error('لم يتم منح إذن الإشعارات');
        }
        return;
      }

      if (state === 'subscribed') {
        await unsubscribeFromPush();
        setState('unsubscribed');
        toast.success('تم إيقاف إشعارات الجهاز');
      } else {
        const success = await subscribeToPush();
        setState(success ? 'subscribed' : 'unsubscribed');
        if (success) toast.success('تم تفعيل إشعارات الجهاز');
        else toast.error('لم يتم منح إذن الإشعارات');
      }
    } catch {
      toast.error('تعذّر تحديث إعدادات الإشعارات');
      if (!isNative) setState(await getPushSubscriptionState());
      else {
        getNativePushPermissionState()
          .then((permission) =>
            setState(permission === 'granted' ? 'subscribed' : 'unsubscribed'),
          )
          .catch(() => setState('unsupported'));
      }
    }
  };

  if (state === 'unsupported' || (isNative === false && !hasVapidKey)) {
    return (
      <div className="flex items-center gap-3 rounded-lg border p-4 text-sm text-muted-foreground">
        <BellOff className="h-5 w-5 shrink-0" />
        <p>إشعارات الجهاز غير مدعومة على هذا المتصفح/الجهاز حاليًا.</p>
      </div>
    );
  }

  // FIX PWA-CRITICAL-05: حالة التحميل الأولى (قبل أن يحسم useEffect
  // الحالة الفعلية عبر getPushSubscriptionState) كانت تُعامَل ضمنيًا مثل
  // "غير مشترك" في كل الشروط أدناه (state === 'subscribed' تكون false)،
  // فيظهر للمستخدم لحظيًا "غير مفعّلة" + زر "تفعيل" حتى لو كان مشتركًا
  // فعلًا — وميض حالة خاطئة يستمر لحظة قبل تصحيحه. نعرض حالة محايدة
  // بدل الافتراض.
  const isChecking = state === 'loading';

  return (
    <div className="flex items-center justify-between gap-3 rounded-lg border p-4">
      <div className="flex items-center gap-3">
        {state === 'subscribed' ? (
          <Bell className="h-5 w-5 text-primary" />
        ) : (
          <BellOff className="h-5 w-5 text-muted-foreground" />
        )}
        <div>
          <p className="font-medium">إشعارات هذا الجهاز</p>
          <p className="text-sm text-muted-foreground">
            {isChecking ? 'جارٍ التحقق…' : state === 'subscribed' ? 'مفعّلة حاليًا' : 'غير مفعّلة'}
          </p>
        </div>
      </div>
      <Button
        variant={state === 'subscribed' ? 'outline' : 'default'}
        size="sm"
        disabled={isChecking}
        onClick={handleToggle}
      >
        {isChecking ? '…' : state === 'subscribed' ? 'إيقاف' : 'تفعيل'}
      </Button>
    </div>
  );
}
