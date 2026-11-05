'use client';

/**
 * PERF-BUNDLE-HEADER-01 — أجزاء الهيدر التي لا تُرى في أول رسم.
 *
 * PublicHeader موجود في layout كل صفحة عامة وصفحات (auth)، وكان يستورد ثابتًا:
 *   - MobileNav (~29 KB مصدر) + useAuthMutations (~20 KB) + navigation +
 *     useSellers/useServiceProviders + offlineSelfWarm … ولا يُرى منها شيء
 *     قبل نقرة الهامبرغر.
 *   - NotificationBell / MessagesLink / UserMenu — تُعرض للمسجَّل فقط بعد
 *     mount (isAuthenticated = mounted && …)، وMessagesLink وحده يسحب
 *     useConversations → مخازن offline للرسائل والوسائط (~25 KB).
 *
 * كلها هنا خلف dynamic({ ssr: false }) فلا تدخل First Load JS. المخرجات
 * الأولى (SSR + أول رسم عميل) لا تتغير لأن النسخ المستبدلة كانت إمّا غير
 * معروضة للزائر أصلًا، أو (MobileNav) يُعرض منها الزر فقط — والزر هنا
 * نسخة طبق الأصل بنفس id/aria.
 */
import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { useUIStore, selectIsMobileNavOpen } from '@/store/ui.store';

const loadMobileNav = () => import('@/components/layout/MobileNav').then((m) => m.MobileNav);

const MobileNavImpl = dynamic(loadMobileNav, { ssr: false, loading: () => null });

export const LazyNotificationBell = dynamic(
  () => import('@/components/layout/NotificationBell').then((m) => m.NotificationBell),
  { ssr: false, loading: () => null },
);

export const LazyMessagesLink = dynamic(
  () => import('@/components/layout/MessagesLink').then((m) => m.MessagesLink),
  { ssr: false, loading: () => null },
);

export const LazyUserMenu = dynamic(
  () => import('@/components/layout/UserMenu').then((m) => m.UserMenu),
  { ssr: false, loading: () => null },
);

// يجب أن تطابق الثوابت داخل MobileNav.tsx (focus-restore يعتمد على TOGGLE_ID).
const NAV_ID = 'mobile-nav-drawer';
const TOGGLE_ID = 'mobile-nav-toggle';

const selectToggleMobileNav = (s: ReturnType<typeof useUIStore.getState>) => s.toggleMobileNav;

/**
 * زر الهامبرغر خفيف (يظهر فورًا) + الدرج الثقيل يُحمَّل عند أول فتح من أي مصدر
 * (هذا الزر أو BottomNav عبر ui.store) ويبقى مركّبًا بعدها لتعمل حركة الإغلاق
 * واستعادة التركيز كما كانت. الـ chunk يُسخَّن وقت الخمول لتكون أول نقرة فورية
 * وليدخل كاش الـ SW للاستخدام دون اتصال.
 */
export function LazyMobileNav({ hideTrigger = false }: { hideTrigger?: boolean } = {}) {
  const isOpen = useUIStore(selectIsMobileNavOpen);
  const toggleMobileNav = useUIStore(selectToggleMobileNav);
  const [armed, setArmed] = useState(false);

  useEffect(() => {
    if (isOpen) setArmed(true);
  }, [isOpen]);

  useEffect(() => {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (id: number) => void;
    };
    const warm = () => { void loadMobileNav().catch(() => undefined); };
    if (typeof w.requestIdleCallback === 'function') {
      const id = w.requestIdleCallback(warm, { timeout: 6000 });
      return () => w.cancelIdleCallback?.(id);
    }
    const t = window.setTimeout(warm, 4000);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <>
      {!hideTrigger && (
        <button
          id={TOGGLE_ID}
          onClick={toggleMobileNav}
          className="rounded p-2 hover:bg-muted"
          aria-label={isOpen ? 'أغلق القائمة' : 'افتح القائمة'}
          aria-expanded={isOpen}
          aria-controls={NAV_ID}
        >
          <span aria-hidden="true" className="block h-0.5 w-5 bg-foreground" />
          <span aria-hidden="true" className="mt-1 block h-0.5 w-5 bg-foreground" />
          <span aria-hidden="true" className="mt-1 block h-0.5 w-5 bg-foreground" />
        </button>
      )}
      {armed ? <MobileNavImpl hideTrigger /> : null}
    </>
  );
}
