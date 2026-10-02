import Link from 'next/link';
import type { Metadata } from 'next';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';

export const metadata: Metadata = {
  title: '404 — المحتوى غير متاح',
  robots: { index: false },
};

/**
 * Segment-level 404 for notFound() thrown inside this route group, so
 * the group's layout (header, navigation) stays on screen instead of
 * falling through to the bare root app/not-found.tsx. Unmatched URLs
 * still resolve to the root one — Next.js only routes those there.
 * No <main> here: the group layout already provides it.
 */
export default function GroupNotFound() {
  return (
    <div className="mx-auto flex min-h-[50vh] max-w-xl flex-col items-center justify-center gap-4 px-4 py-16 text-center">
      <span className="text-7xl font-bold text-muted-foreground/30" aria-hidden>404</span>
      <h1 className="text-2xl font-semibold">المحتوى غير متاح</h1>
      <p className="max-w-sm text-muted-foreground">هذا المحتوى غير موجود، أو لا تملك صلاحية الوصول إليه.</p>
      <Button asChild>
        <Link href={ROUTES.dashboard}>العودة للوحة التحكم</Link>
      </Button>
    </div>
  );
}
