import type { Metadata }      from 'next';
import { Suspense }           from 'react';
import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';
import { buildMetadata }      from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'استرداد كلمة المرور', noIndex: true });

export default function ForgotPasswordPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">نسيت كلمة المرور؟</h1>
        </div>
        <div className="bg-card rounded-xl border p-6">
          <Suspense><ForgotPasswordForm /></Suspense>
        </div>
      </div>
    </div>
  );
}
