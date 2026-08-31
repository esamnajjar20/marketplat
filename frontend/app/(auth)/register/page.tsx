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
//
// DESIGN-PASS AUTH-01: same sizing pass as LoginPage — see its comment.
export default function RegisterPage() {
  return (
    <div className="space-y-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary sm:text-4xl">إنشاء حساب جديد</h1>
        <p className="mt-3 text-muted-foreground">
          انضم إلى مجتمع سوق غزة وابدأ في البيع والشراء بكل سهولة
        </p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-md sm:p-8">
        <Suspense><RegisterForm /></Suspense>
      </div>
    </div>
  );
}
