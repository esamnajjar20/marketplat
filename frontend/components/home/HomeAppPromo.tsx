'use client';

import { useEffect, useState } from 'react';
import { Smartphone } from 'lucide-react';
import { getRawAndroidAppUrl } from '@/lib/env';
import { isNativePlatform } from '@/lib/capacitor/platform';

/**
 * Android app promo. Renders nothing unless NEXT_PUBLIC_ANDROID_APP_URL is
 * configured, and never inside the Capacitor app itself (the visitor already
 * has it). Decided after mount, so it cannot cause a hydration mismatch.
 */
export function HomeAppPromo() {
  const url = getRawAndroidAppUrl()?.trim();
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (!url) return;
    let alive = true;
    void isNativePlatform().then((native) => {
      if (alive && !native) setShow(true);
    });
    return () => {
      alive = false;
    };
  }, [url]);

  if (!url || !show) return null;

  return (
    <section className="container mx-auto max-w-7xl px-4" aria-label="تطبيق الأندرويد">
      <a
        href={url}
        rel="noopener"
        className="flex items-center gap-3 rounded-2xl border border-border/70 bg-card px-4 py-3 shadow-xs transition-colors hover:border-primary/40"
      >
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Smartphone className="h-5 w-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm font-bold">حمّل تطبيق سوق غزة</span>
          <span className="block text-xs text-muted-foreground">أسرع وأخف، مع إشعارات فورية للأندرويد.</span>
        </span>
        <span className="shrink-0 text-sm font-semibold text-primary">تحميل ←</span>
      </a>
    </section>
  );
}
