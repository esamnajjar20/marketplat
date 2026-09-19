'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { ArrowRight } from 'lucide-react';
import { CreateRequestForm } from '@/components/requests/CreateRequestForm';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { ROUTES } from '@/lib/constants';

/**
 * FIX NEXT15-SEARCHPARAMS-SUSPENSE: Next.js 15 requires any client
 * component that calls `useSearchParams()` to be wrapped in a <Suspense>
 * boundary — otherwise Next's static-prerender pass for the route throws
 * ("useSearchParams() should be wrapped in a suspense boundary"), which
 * the nearest error boundary catches and shows as "حدث خطأ أثناء تحميل
 * هذه الصفحة". That prerender pass runs when the SW warms this route
 * (it was recently added to PERSONAL_SHELL_ROUTES_ESSENTIAL), which is
 * exactly when the bug started showing up.
 *
 * CreateRequestForm reads `?draftId=` via useSearchParams, so it must
 * sit inside Suspense. The boundary is placed at the route level (not
 * inside the component) so its fallback renders in the page shell and
 * the rest of the layout stays interactive while it resolves.
 */
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
      <Suspense
        fallback={
          <div className="flex justify-center py-12">
            <LoadingSpinner />
          </div>
        }
      >
        <CreateRequestForm />
      </Suspense>
    </div>
  );
}
