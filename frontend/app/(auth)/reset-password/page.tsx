import type { Metadata }   from 'next';
import { Suspense }        from 'react';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { buildMetadata }   from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'تعيين كلمة مرور جديدة', noIndex: true });

interface Props { searchParams: Promise<{ token?: string }> }

// AUDIT-FIX auth#2: same fix as LoginPage — see its comment.
export default async function ResetPasswordPage({ searchParams }: Props) {
  const { token = '' } = await searchParams;
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">تعيين كلمة مرور جديدة</h1>
      </div>
      <div className="bg-card rounded-xl border p-6">
        <Suspense><ResetPasswordForm token={token} /></Suspense>
      </div>
    </div>
  );
}
