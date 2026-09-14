'use client';

/**
 * إدارة إذن إشعارات الجهاز (Web Push / Native FCM) مع عرض صريح
 * لحالة إذن النظام — خاصة عند الرفض الدائم (denied).
 */

import { useEffect, useState, useCallback } from 'react';
import { Bell, BellOff, AlertTriangle, Smartphone } from 'lucide-react';
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
  getNativePushPermissionState,
  registerNativePush,
  unregisterNativePush,
} from '@/lib/capacitor/nativePush';
import { toast } from 'sonner';
import { getRawVapidPublicKey } from '@/lib/env';
import { cn } from '@/lib/utils';

const NATIVE_TOKEN_STORAGE_KEY = 'push:native-fcm-token';

type SubState = 'loading' | 'subscribed' | 'unsubscribed' | 'unsupported';
type PermState = 'granted' | 'denied' | 'default' | 'unsupported' | 'loading';

export function PushNotificationToggle() {
  const [state, setState] = useState<SubState>('loading');
  const [permission, setPermission] = useState<PermState>('loading');
  const [isNative, setIsNative] = useState<boolean | null>(null);
  const hasVapidKey = Boolean(getRawVapidPublicKey());

  const refresh = useCallback(async () => {
    try {
      const native = await isNativePlatform();
      setIsNative(native);

      if (native) {
        const p = await getNativePushPermissionState();
        const mapped: PermState =
          p === 'granted' ? 'granted' : p === 'denied' ? 'denied' : 'default';
        setPermission(mapped);
        setState(p === 'granted' ? 'subscribed' : 'unsubscribed');
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
    refresh().then(() => {
      if (cancelled) return;
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
          const token = window.localStorage.getItem(NATIVE_TOKEN_STORAGE_KEY);
          if (token) await unregisterNativePush(token);
          window.localStorage.removeItem(NATIVE_TOKEN_STORAGE_KEY);
          setState('unsubscribed');
          setPermission('default');
          toast.success('تم إيقاف إشعارات الجهاز');
        } else {
          const token = await registerNativePush();
          if (token) window.localStorage.setItem(NATIVE_TOKEN_STORAGE_KEY, token);
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
        setState('unsubscribed');
        toast.success('تم إيقاف إشعارات الجهاز');
      } else {
        const success = await subscribeToPush();
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
                  ? 'مرفوضة من إعدادات المتصفح/النظام'
                  : isOn
                    ? 'مفعّلة — تصلك حتى والصفحة مغلقة'
                    : 'غير مفعّلة على هذا الجهاز'}
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

      {isDenied && (
        <div className="rounded-xl border border-destructive/25 bg-destructive/5 px-4 py-3 text-xs leading-relaxed text-muted-foreground">
          <p className="font-medium text-destructive">كيف تعيد تفعيل الإذن؟</p>
          <ol className="mt-2 list-decimal space-y-1 ps-4">
            <li>افتح إعدادات الموقع في المتصفح (أيقونة القفل بجانب الرابط).</li>
            <li>ابحث عن «الإشعارات» وغيّرها إلى «السماح».</li>
            <li>أعد تحميل الصفحة ثم اضغط «تفعيل».</li>
          </ol>
          <p className="mt-2 text-[11px]">
            على الجوال: إعدادات النظام → التطبيقات → المتصفح → الإشعارات.
          </p>
        </div>
      )}
    </div>
  );
}
