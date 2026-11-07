import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { notFound, redirect } from 'next/navigation';
import { UserRound } from 'lucide-react';
import { sellersApi } from '@/api/sellers.api';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { ROUTES } from '@/lib/constants';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * Legacy seller-profile URL. SellerProfile IDs are not user IDs, so this
 * route resolves the canonical user ID before redirecting to /profile/[id].
 * Only a confirmed 404 is treated as not-found; transient API failures get a
 * recoverable page instead of redirecting to a guaranteed-wrong profile ID.
 */
export default async function LegacySellerProfileRedirectPage({ params }: Props) {
  const { id } = await params;
  if (!id?.trim()) notFound();

  let targetUserId: string | null = null;
  let statusCode: number | undefined;
  try {
    const res = await sellersApi.getById(id);
    targetUserId = res.data.data?.userId?.trim() || null;
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
        title="تعذر فتح الملف الشخصي للبائع"
        description="لم نتمكن من تحديد حساب المستخدم المرتبط بهذا الرابط. يمكنك العودة إلى قائمة البائعين والمحاولة من جديد."
        tone="warning"
        role="alert"
        action={<IntentPrefetchLink href={ROUTES.sellersRanking} className="text-sm font-semibold text-primary hover:underline" prefetch={false}>العودة إلى البائعين</IntentPrefetchLink>}
      />
    </div>
  );
}
