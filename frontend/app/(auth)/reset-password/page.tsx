import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';
import { AuthBrand } from '@/components/auth/AuthBrand';

const ResetPasswordForm = dynamic(
  () =>
    import('@/components/auth/ResetPasswordForm').then(
      (module) => module.ResetPasswordForm,
    ),
);

export const metadata: Metadata = buildMetadata({ title: 'تعيين كلمة مرور جديدة', noIndex: true });

interface Props {
  searchParams: Promise<{ token?: string }>;
}

export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token = '' } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center">
        <AuthBrand />
        <h1 className="text-[28px] font-extrabold tracking-tight text-[#1F4D33] sm:text-[32px]">
          تعيين كلمة مرور جديدة
        </h1>
      </div>
      <div className="rounded-2xl border border-[#EAE3D6] bg-white p-5 shadow-[0_1px_3px_rgba(42,36,29,0.06)] sm:p-7">
        <Suspense fallback={<SuspenseFallback />}>
          <ResetPasswordForm token={token} />
        </Suspense>
      </div>
    </div>
  );
}
