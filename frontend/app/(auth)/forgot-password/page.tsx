import type { Metadata }      from 'next';
import dynamic from 'next/dynamic';
import { Suspense }           from 'react';
import { buildMetadata }      from '@/lib/seo';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';

const ForgotPasswordForm = dynamic(
  () =>
    import('@/components/auth/ForgotPasswordForm').then(
      (module) => module.ForgotPasswordForm,
    ),
);

export const metadata: Metadata = buildMetadata({ title: 'استرداد كلمة المرور', noIndex: true });

// #2: same LoginPage — see its comment.
export default function ForgotPasswordPage() {
  return (
    <div className="space-y-8">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">نسيت كلمة المرور؟</h1>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-md">
        <Suspense fallback={<SuspenseFallback />}><ForgotPasswordForm /></Suspense>
      </div>
    </div>
  );
}
