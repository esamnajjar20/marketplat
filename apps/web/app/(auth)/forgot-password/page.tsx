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
        <h1 className="text-[28px] font-extrabold tracking-tight text-[#1F4D33] sm:text-[32px]">
          نسيت كلمة المرور؟
        </h1>
        <p className="mt-2 max-w-sm text-[14px] leading-relaxed text-[#6B6459]">
          أدخل بريدك الإلكتروني وسنرسل لك رابطاً لإعادة تعيين كلمة المرور.
        </p>
      </div>
      <div className="rounded-2xl border border-[#EAE3D6] bg-white p-5 shadow-[0_1px_3px_rgba(42,36,29,0.06)] sm:p-7">
        <Suspense fallback={<SuspenseFallback />}>
          <ForgotPasswordForm />
        </Suspense>
      </div>
    </div>
  );
}
