import { redirect } from 'next/navigation';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { ROUTES } from '@/lib/constants';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * UNIFIED-PROFILE: same reasoning as sellers/[id]/page.tsx's own
 * redirect — a service provider is a role a person holds (built on top
 * of their SellerProfile), not a page-worthy entity of its own.
 *
 * FIX: The API returns:
 *   {
 *     id: <serviceProviderId>,
 *     sellerProfileId: <sellerProfileId>,
 *     sellerProfile: { userId: <userId>, ... }
 *   }
 * The old code read data.userId (undefined). Now reads
 * data.sellerProfile.userId first, with fallbacks.
 */
export default async function LegacyServiceProviderRedirectPage({ params }: Props) {
  const { id } = await params;

  let targetUserId: string | null = null;

  try {
    const res = await serviceProvidersApi.getById(id);
    const data = res.data.data as any;

    targetUserId =
      data?.sellerProfile?.userId ??   // ✅ المسار الصحيح
      data?.userId ??                   // احتياطي
      null;
  } catch {
    /* provider not found / request failed — fall through */
  }

  // If we still don't have a userId, fall back to the sellerProfileId
  // (the profile page handles it, since profile IDs are derived from user IDs).
  redirect(ROUTES.userProfile(targetUserId ?? id));
}
