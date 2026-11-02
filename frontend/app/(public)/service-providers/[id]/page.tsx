import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { UserRound } from 'lucide-react';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ROUTES } from '@/lib/constants';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Legacy provider URL. A ServiceProvider ID is not a User ID; resolve the
 * joined sellerProfile.userId before forwarding to the canonical profile.
 * Do not redirect a provider ID to /profile/[id] when lookup fails.
 */
export default async function LegacyServiceProviderRedirectPage({ params }: Props) {
  const { id } = await params;
  if (!id?.trim()) notFound();

  let targetUserId: string | null = null;
  let statusCode: number | undefined;
  try {
    const res = await serviceProvidersApi.getById(id);
    targetUserId = res.data.data?.sellerProfile?.userId?.trim() || null;
  } catch (error) {
    const failure = error as { statusCode?: number; response?: { status?: number } };
    statusCode = failure.statusCode ?? failure.response?.status;
  }

  if (statusCode === 404) notFound();
  if (targetUserId) redirect(ROUTES.userProfile(targetUserId));

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <EmptyState
        icon={<UserRound className="h-10 w-10" />}
        title="تعذر فتح الملف الشخصي لمقدم الخدمة"
        description="لم نتمكن من تحديد حساب المستخدم المرتبط بهذا الرابط. يمكنك تصفح مقدمي الخدمة والمحاولة من جديد."
        tone="warning"
        role="alert"
        action={<Link href={ROUTES.serviceProviders} className="text-sm font-semibold text-primary hover:underline">تصفح مقدمي الخدمة</Link>}
      />
    </div>
  );
}
