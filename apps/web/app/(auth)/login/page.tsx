import type { Metadata } from 'next';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import { buildMetadata } from '@/lib/seo';
import { SuspenseFallback } from '@/components/shared/feedback/SuspenseFallback';
import { AuthBrand } from '@/components/auth/AuthBrand';

const LoginForm = dynamic(
  () => import('@/components/auth/LoginForm').then((module) => module.LoginForm),
);

export const metadata: Metadata = buildMetadata({ title: 'تسجيل الدخول', noIndex: true });

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col items-center text-center">
        <AuthBrand />
        <h1 className="text-[28px] font-extrabold tracking-tight text-[#1F4D33] sm:text-[32px]">
          تسجيل الدخول
        </h1>
        <p className="mt-2 text-[14px] text-[#6B6459]">مرحبًا بك مجددًا في سوق غزة</p>
      </div>
      <div className="rounded-2xl border border-[#EAE3D6] bg-white p-5 shadow-[0_1px_3px_rgba(42,36,29,0.06)] sm:p-7">
        <Suspense fallback={<SuspenseFallback />}>
          <LoginForm />
        </Suspense>
      </div>
    </div>
  );
}
