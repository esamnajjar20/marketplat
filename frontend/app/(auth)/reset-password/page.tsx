import type { Metadata }   from 'next';
import { Suspense }        from 'react';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { buildMetadata }   from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'تعيين كلمة مرور جديدة', noIndex: true });

interface Props { searchParams: Promise<{ token?: string }> }

// #2: same LoginPage — see its comment.
export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token = '' } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold text-primary sm:text-3xl">تعيين كلمة مرور جديدة</h1>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-md">
        <Suspense><ResetPasswordForm token={token} /></Suspense>
      </div>
    </div>
  );
}
