import type { Metadata }  from 'next';
import { Suspense }       from 'react';
import { RegisterForm }   from '@/components/auth/RegisterForm';
import { buildMetadata }  from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'إنشاء حساب', noIndex: true });

export default function RegisterPage() {
  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-8 bg-muted/30">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-bold">إنشاء حساب جديد</h1>
          <p className="text-sm text-muted-foreground mt-1">انضم إلى سوق غزة مجاناً</p>
        </div>
        <div className="bg-card rounded-xl border p-6">
          <Suspense><RegisterForm /></Suspense>
        </div>
      </div>
    </div>
  );
}
