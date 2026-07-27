/**
 * Unauthorized — rendered when the API returns 401.
 *
 * Two contexts:
 *  A) User is NOT logged in  → prompt to sign in.
 *  B) Token has expired       → prompt to sign in again.
 *
 * Middleware normally catches this before the page renders,
 * but client-side fetches (TanStack Query) can hit 401 if the
 * token expires mid-session before the refresh interceptor fires.
 */
'use client';

import Link     from 'next/link';
import { usePathname } from 'next/navigation';
import { Button }   from '@/components/shared/ui/Button';
import { ROUTES }   from '@/lib/constants';

interface UnauthorizedProps {
  /** Override the default heading. */
  title?: string;
  /** Override the default description. */
  description?: string;
}

export function Unauthorized({
  title       = 'يلزم تسجيل الدخول',
  description = 'يجب تسجيل الدخول لعرض هذا المحتوى.',
}: UnauthorizedProps) {
  const pathname = usePathname();
  const loginHref = `${ROUTES.login}?from=${encodeURIComponent(pathname)}`;

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-6 px-4 text-center">
      <span className="text-6xl">🔒</span>

      <div className="space-y-2">
        <h2 className="text-2xl font-bold">{title}</h2>
        <p className="max-w-sm text-muted-foreground">{description}</p>
      </div>

      <div className="flex gap-3">
        <Button asChild>
          <Link href={loginHref}>تسجيل الدخول</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href={ROUTES.register}>إنشاء حساب</Link>
        </Button>
      </div>
    </div>
  );
}
