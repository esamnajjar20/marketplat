import Link from 'next/link';
import type { Metadata } from 'next';
import { Button } from '@/components/shared/ui/Button';

// FIX A11Y/UX-01: this page was entirely in English (title, heading,
// copy, and button label) on an otherwise fully Arabic/RTL site — the
// same class of gap already fixed in app/error.tsx and
// app/global-error.tsx, but this one is a plain page file rather than
// an interactive error boundary, which is presumably why it was missed
// in that pass.
export const metadata: Metadata = {
  title: '404 — الصفحة غير موجودة',
  robots: { index: false },
};

/**
 * Global 404 — rendered when no route matches.
 * Sits outside all route groups so it has no group layout.
 */
export default function NotFound() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 text-center">
      <span className="text-8xl font-bold text-muted-foreground/30">404</span>
      <h1 className="text-2xl font-semibold">الصفحة غير موجودة</h1>
      <p className="max-w-sm text-muted-foreground">
        الصفحة التي تبحث عنها غير موجودة أو تم نقلها.
      </p>
      <Button asChild>
        <Link href="/">العودة للرئيسية</Link>
      </Button>
    </main>
  );
}
