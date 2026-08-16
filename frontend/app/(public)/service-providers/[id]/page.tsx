import { redirect } from 'next/navigation';
import { serviceProvidersApi } from '@/api/service-providers.api';
import { ROUTES } from '@/lib/constants';

interface Props {
  params: Promise<{ id: string }>;
}

/**
 * UNIFIED-PROFILE: same reasoning as sellers/[id]/page.tsx's own
 * redirect — a service provider is a role a person holds (built on top
 * of their SellerProfile, see schema.prisma's ServiceProviderDetails),
 * not a page-worthy entity of its own, unlike a store. This page's old
 * content (ServiceProviderHeader + listings grid) now lives in
 * /profile/[userId]'s "الخدمات" tab (ProfileTabsSection /
 * ProfileServiceProviderSummary). Kept live only to forward old
 * bookmarks/shared links. See sellers/[id]/page.tsx's comment for why
 * redirect() must run after the try/catch, never inside it.
 */
export default async function LegacyServiceProviderRedirectPage({ params }: Props) {
  const { id } = await params;

  let targetUserId: string | null = null;
  try {
    const res = await serviceProvidersApi.getById(id);
    targetUserId = res.data.data?.sellerProfile.userId ?? null;
  } catch {
    /* provider not found / request failed — fall through below */
  }

  redirect(ROUTES.userProfile(targetUserId ?? id));
}
