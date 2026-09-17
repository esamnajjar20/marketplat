'use client';

import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CreateRequestForm } from '@/components/requests/CreateRequestForm';
import { ROUTES } from '@/lib/constants';

export default function NewRequestPage() {
  return (
    <div className="mx-auto max-w-lg space-y-5 p-4 pb-12" dir="rtl">
      <div>
        <Link
          href={ROUTES.requests}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
          سوق الطلبات
        </Link>
        <h1 className="mt-3 text-xl font-bold tracking-tight">نشر طلب / احتياج</h1>
        <p className="mt-1 text-sm text-muted-foreground leading-relaxed">
          صف ما تبحث عنه (خدمة، منتج، أو إيجار) واستقبل عروضًا من البائعين ومقدّمي
          الخدمة.
        </p>
      </div>
      <CreateRequestForm />
    </div>
  );
}
