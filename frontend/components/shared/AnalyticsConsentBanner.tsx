'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ROUTES } from '@/lib/constants';
import { getAnalyticsConsent, setAnalyticsConsent, type AnalyticsConsent } from '@/lib/analyticsConsent';

/**
 * Privacy-first analytics consent. Raw product analytics is disabled until
 * the visitor explicitly allows it. Rejecting it never blocks marketplace use.
 */
export function AnalyticsConsentBanner() {
  // HYDRATION-SAFE: render nothing on the server and nothing on the
  // first client render. Before this fix the server always rendered
  // <aside> (choice is null), but the moment useEffect read the
  // persisted consent it removed the element — a DOM mutation that
  // landed during React 19's hydration window and produced #418
  // args[]=HTML. Gating on a mounted flag keeps the first render
  // identical on both sides; the banner then appears (or stays hidden)
  // entirely client-side after hydration.
  const [mounted, setMounted] = useState(false);
  const [choice, setChoice] = useState<AnalyticsConsent | null>(null);

  useEffect(() => {
    setMounted(true);
    setChoice(getAnalyticsConsent());
  }, []);

  if (!mounted) return null;
  if (choice) return null;

  return (
    <aside
      role="dialog"
      aria-label="إعدادات تحليلات الاستخدام"
      className="fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-2xl rounded-2xl border border-border bg-card p-4 shadow-lg sm:inset-x-auto sm:bottom-5 sm:right-5 sm:left-auto"
      dir="rtl"
    >
      <div className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold">تحسين سوق غزة</h2>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">
            نستخدم تحليلات أساسية مثل مشاهدات الصفحات والبحث لفهم استخدام المنصة وتحسينها.
            يمكنك السماح بها أو رفضها دون التأثير على استخدام الموقع.{' '}
            <Link href={ROUTES.privacy} className="underline underline-offset-2">
              سياسة الخصوصية
            </Link>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => { setAnalyticsConsent('granted'); setChoice('granted'); }}
            className="min-h-10 rounded-xl bg-primary px-4 text-sm font-medium text-primary-foreground"
          >
            السماح بالتحليلات
          </button>
          <button
            type="button"
            onClick={() => { setAnalyticsConsent('denied'); setChoice('denied'); }}
            className="min-h-10 rounded-xl border border-border bg-background px-4 text-sm font-medium"
          >
            لا شكرًا
          </button>
        </div>
      </div>
    </aside>
  );
}
