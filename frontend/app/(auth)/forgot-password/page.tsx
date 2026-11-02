import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';
import { AuthBrand } from '@/components/auth/AuthBrand';

const ForgotPasswordForm = dynamic(
  () =>
    import('@/components/auth/ForgotPasswordForm').then(
      (module) => module.ForgotPasswordForm,
    ),
);

export const metadata: Metadata = buildMetadata({ title: 'نسيت كلمة المرور', noIndex: true });

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center">
        <AuthBrand />
        <h1 className="text-[28px] font-extrabold tracking-tight text-[var(--legacy-primary-deep)] sm:text-[32px]">
          نسيت كلمة المرور؟
        </h1>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-[var(--legacy-muted-text)]">
          أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.
        </p>
      </div>
      <div className="rounded-2xl border border-[var(--legacy-border)] bg-card p-5 shadow-[0_1px_3px_rgba(42,36,29,0.06)] sm:p-7">
        <Suspense fallback={<SuspenseFallback />}>
          <ForgotPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
