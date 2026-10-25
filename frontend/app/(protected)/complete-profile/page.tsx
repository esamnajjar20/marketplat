import type { Metadata } from 'next';
import { CompleteProfileForm } from '@/components/auth/CompleteProfileForm';
import { AuthBrand } from '@/components/auth/AuthBrand';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'أكمل ملفك الشخصي', noIndex: true });

/**
 * /complete-profile — خطوة أخيرة بعد تسجيل Google.
 */
export default function CompleteProfilePage() {
  return (
    <div className="mx-auto w-full max-w-lg space-y-6 px-3 py-10 sm:px-4 lg:py-14">
      <div className="flex flex-col items-center text-center">
        <AuthBrand />
        <h1 className="text-[28px] font-extrabold tracking-tight text-[#1F4D33] sm:text-[32px]">
          أكمل ملفك الشخصي
        </h1>
        <p className="mt-2 text-[14px] text-[#6B6459]">
          خطوة أخيرة قبل أن تبدأ في استخدام سوق غزة.
        </p>
      </div>
      <div className="rounded-2xl border border-[#EAE3D6] bg-white p-5 shadow-[0_1px_3px_rgba(42,36,29,0.06)] sm:p-7">
        <CompleteProfileForm />
      </div>
    </div>
  );
}
