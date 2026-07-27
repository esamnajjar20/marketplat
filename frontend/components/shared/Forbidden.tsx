/**
 * Forbidden — rendered when the API returns 403.
 *
 * Shown when a user is authenticated but lacks the required role/permission.
 * Common cases:
 *  - Regular user trying to access /admin/* (middleware should catch this,
 *    but client-side navigations may reach here).
 *  - User trying to edit/delete another user's ad.
 */
'use client';

import Link        from 'next/link';
import { useRouter } from 'next/navigation';
import { Button }  from '@/components/shared/ui/Button';
import { ROUTES }  from '@/lib/constants';

interface ForbiddenProps {
  title?:       string;
  description?: string;
  /** Show a "Go back" button instead of a fixed link. */
  showBack?: boolean;
}

export function Forbidden({
  title       = 'غير مصرَّح بالوصول',
  description = 'لا تملك صلاحية عرض هذه الصفحة.',
  showBack    = false,
}: ForbiddenProps) {
  const router = useRouter();

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <span className="text-6xl">🚫</span>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="max-w-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex gap-3">
        {showBack ? (
          <Button variant="outline" onClick={() => router.back()}>
            رجوع
          </Button>
        ) : (
          <Button asChild variant="outline">
            <Link href={ROUTES.dashboard}>الذهاب إلى لوحة التحكم</Link>
          </Button>
        )}
        <Button asChild>
          <Link href={ROUTES.home}>الرئيسية</Link>
        </Button>
      </div>
    </div>
  );
}
