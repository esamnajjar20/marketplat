'use client';

import Link from 'next/link';
import { AlertTriangle, RefreshCw } from 'lucide-react';

interface ServiceProviderErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function ServiceProviderError({ reset }: ServiceProviderErrorProps) {
  return (
    <section
      className="container mx-auto flex min-h-[48vh] max-w-2xl flex-col items-center justify-center px-4 py-12 text-center"
      dir="rtl"
      role="alert"
    >
      <span className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive">
        <AlertTriangle className="h-7 w-7" aria-hidden="true" />
      </span>
      <h1 className="text-xl font-bold">تعذّر تحميل ملف مقدم الخدمة</h1>
      <p className="mt-2 max-w-lg text-sm leading-6 text-muted-foreground">
        قد يكون الاتصال بالخادم غير متاح مؤقتًا. لم نعتبر ذلك دليلًا على فقدان الحساب؛ أعد المحاولة أو تصفح مقدمي الخدمة.
      </p>
      <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
        <button
          type="button"
          onClick={reset}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
        >
          <RefreshCw className="h-4 w-4" aria-hidden="true" />إعادة المحاولة
        </button>
        <Link
          href="/service-providers"
          className="inline-flex min-h-11 items-center rounded-lg border px-4 py-2 text-sm font-semibold hover:bg-muted" prefetch={false}
        >
          تصفح مقدمي الخدمة
        </Link>
      </div>
    </section>
  );
}
