import type { Metadata } from 'next';
import { Suspense }      from 'react';
import { LoginForm }     from '@/components/auth/LoginForm';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'تسجيل الدخول', noIndex: true });

/*
 * AUDIT-FIX auth#2: previously wrapped its own content in another
 * min-h-screen + bg-muted/30 flex-center div, duplicating what
 * AuthLayout (app/(auth)/layout.tsx) already provides — now renders
 * only the actual content; height/centering/background is the
 * layout's job.
 *
 * DESIGN-PASS AUTH-01: title/card sizing matches the reference design
 * (large centered heading + subtitle above a big soft rounded card)
 * instead of the previous compact split-panel version.
 */
export default function LoginPage() {
  return (
    <div className="space-y-10">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-primary sm:text-4xl">تسجيل الدخول</h1>
        <p className="mt-3 text-muted-foreground">مرحباً بك مجدداً في سوق غزة</p>
      </div>
      <div className="rounded-2xl border border-border bg-card p-6 shadow-md sm:p-8">
        <Suspense><LoginForm /></Suspense>
      </div>
    </div>
  );
}
