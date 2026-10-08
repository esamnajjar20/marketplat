'use client';

/** FIX SSR-FALLBACK-02: client-side profile render when the SSR fetch failed. */
import Link from 'next/link';
import { UserX, AlertTriangle } from 'lucide-react';
import { useUser } from '@/hooks/queries/useUsers';
import { PublicProfileHeader } from '@/components/profile/PublicProfileHeader';
import { ProfileTabsSection } from '@/components/profile/ProfileTabsSection';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Button } from '@/components/shared/ui/Button';
import { parseApiError } from '@/lib/errorParser';
import { ROUTES } from '@/lib/constants';

export function PublicProfileClient({ id }: { id: string }) {
  const { data: user, isLoading, isError, error, refetch } = useUser(id);

  if (isLoading) {
    return <div className="flex justify-center py-16"><LoadingSpinner /></div>;
  }

  if (isError || !user) {
    const notFound = isError && parseApiError(error).statusCode === 404;
    return (
      <div className="container mx-auto px-4 py-6">
        <EmptyState
          icon={notFound ? <UserX className="h-10 w-10" /> : <AlertTriangle className="h-10 w-10" />}
          title={notFound ? 'المستخدم غير موجود' : 'تعذّر تحميل الملف الشخصي'}
          description={notFound ? 'ربما تم حذف هذا الحساب أو أن الرابط غير صحيح' : 'حدثت مشكلة في الاتصال، حاول مرة أخرى'}
          action={notFound
            ? <Link href={ROUTES.home} className="text-sm text-primary hover:underline">العودة للرئيسية</Link>
            : <Button type="button" variant="outline" onClick={() => refetch()}>إعادة المحاولة</Button>}
        />
      </div>
    );
  }

  return (
    <div className="container mx-auto w-full max-w-5xl space-y-6 px-3 py-6 sm:px-4 lg:py-8">
      <PublicProfileHeader user={user} />
      <ProfileTabsSection user={user} />
    </div>
  );
}
