import type { Metadata }  from 'next';
import { Suspense }       from 'react';
import { RegisterForm }   from '@/components/auth/RegisterForm';
import { buildMetadata }  from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'إنشاء حساب', noIndex: true });

// AUDIT-FIX auth#2: same fix as LoginPage — see its comment for the
// full reasoning. RegisterForm is the tallest of the four (5 fields),
// so this was also the page where the inner min-h-screen most risked
// pushing the heading above the first-viewport fold on short mobile
// screens before any scrolling.
export default function RegisterPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">إنشاء حساب جديد</h1>
        <p className="text-sm text-muted-foreground mt-1">انضم إلى سوق غزة مجاناً</p>
      </div>
      <div className="bg-card rounded-xl border p-6">
        <Suspense><RegisterForm /></Suspense>
      </div>
    </div>
  );
}
