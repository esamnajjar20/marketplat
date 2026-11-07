'use client';

import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';

export default function ServiceDetailError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <section className="container mx-auto flex min-h-[48vh] max-w-2xl flex-col items-center justify-center px-4 py-12 text-center" dir="rtl" role="alert">
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-bold">تعذّر تحميل تفاصيل الخدمة</h1>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        تعذّر الاتصال بالخادم أو تحميل تفاصيل الخدمة. هذا لا يعني بالضرورة أن الخدمة حُذفت؛ أعد المحاولة أو ارجع إلى قائمة الخدمات.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={reset} className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />إعادة المحاولة
        </button>
        <Link href="/services" className="inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted" prefetch={false}>
          تصفح الخدمات
        </Link>
      </div>
    </section>
  );
}
