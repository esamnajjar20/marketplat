import type { Metadata } from 'next';
import { Suspense }      from 'react';
import { LoginForm }     from '@/components/auth/LoginForm';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'تسجيل الدخول', noIndex: true });

export default function LoginPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 bg-muted/30">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">مرحباً بعودتك</h1>
          <p className="text-sm text-muted-foreground mt-1">سجّل دخولك للمتابعة</p>
        </div>
        <div className="bg-card rounded-xl border p-6">
          <Suspense><LoginForm /></Suspense>
        </div>
      </div>
    </div>
  );
}
