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
import { toast } from 'sonner';

export function PushNotificationToggle() {
  const [state, setState] = useState<'subscribed' | 'unsubscribed' | 'unsupported' | 'loading'>(
    'loading',
  );
  const hasVapidKey = Boolean(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY);

  useEffect(() => {
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
  }, []);

  const handleToggle = async () => {
    setState('loading');
    try {
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
      setState(await getPushSubscriptionState());
    }
  };

  if (state === 'unsupported' || !hasVapidKey) {
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
