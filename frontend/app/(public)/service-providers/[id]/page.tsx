import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { UserRound } from 'lucide-react';
import type { ServiceProviderPublic } from '@/types/service.types';
import { fetchServerApi, ServerApiHttpError } from '@/lib/server/serverApiFetch';
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

  let provider: ServiceProviderPublic | null = null;
  try {
    const response = await fetchServerApi<ServiceProviderPublic>(
      `/service-providers/${encodeURIComponent(id)}`,
      { mode: 'no-store' },
    );
    provider = response.data ?? null;
  } catch (error) {
    // A missing provider is a real 404. Do not turn transport/5xx failures
    // into a misleading message that claims the linked account is missing.
    if (error instanceof ServerApiHttpError && [400, 404, 422].includes(error.statusCode)) notFound();
    throw error;
  }

  const targetUserId = provider?.sellerProfile?.userId?.trim() || null;
  if (targetUserId) redirect(ROUTES.userProfile(targetUserId));

  return (
    <div className="container mx-auto max-w-3xl px-4 py-8">
      <EmptyState
        icon={<UserRound className="h-10 w-10" />}
        title="بيانات ملف مقدم الخدمة غير مكتملة"
        description="تم العثور على مقدم الخدمة، لكن بيانات الحساب المرتبط به غير متاحة. يمكنك تصفح مقدمي الخدمة والمحاولة من جديد."
        tone="warning"
        role="alert"
        action={<Link href={ROUTES.serviceProviders} className="text-sm font-semibold text-primary hover:underline">تصفح مقدمي الخدمة</Link>}
      />
    </div>
  );
}
