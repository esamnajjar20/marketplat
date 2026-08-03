import type { Metadata } from 'next';
import { Suspense }      from 'react';
import { LoginForm }     from '@/components/auth/LoginForm';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'تسجيل الدخول', noIndex: true });

/*
 * AUDIT-FIX auth#2: previously wrapped its own content in another
 * min-h-screen + bg-muted/30 flex-center div, duplicating what
 * AuthLayout (app/(auth)/layout.tsx) already provides on its form
 * panel (min-h-screen grid + flex items-center justify-center) —
 * nested double-centering, plus a stray grey band that clashed with
 * the layout's own background at the panel edges on lg+ screens. This
 * now renders only the actual content; height/centering/background is
 * the layout's job.
 */
export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-2xl font-bold">مرحباً بعودتك</h1>
        <p className="text-sm text-muted-foreground mt-1">سجّل دخولك للمتابعة</p>
      </div>
      <div className="bg-card rounded-xl border p-6">
        <Suspense><LoginForm /></Suspense>
      </div>
    </div>
  );
}
