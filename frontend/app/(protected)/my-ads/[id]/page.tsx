'use client';

/**
 * Edit my ad page (alternate route) — Protected Client Component.
 * FIX BUILD-02: EditAdForm only accepts `{ ad: Ad }`, not `adId` — it
 * has no data-fetching of its own. Mirrors the working pattern in
 * app/(protected)/ads/[id]/edit/page.tsx: fetch the ad here via
 * useAd(id) and pass the resolved ad down.
 *
 * FIX UX-14: same ownership-check fix as ads/[id]/edit/page.tsx — see
 * that file's comment for the full rationale.
 */
import { use, useEffect }      from 'react';
import { notFound, useRouter } from 'next/navigation';
import { EditAdForm }     from '@/components/ads/EditAdForm';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useAd }          from '@/hooks/queries/useAds';
import { useAuthStore, selectUser, selectIsAdmin } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';

interface EditAdPageProps {
  params: Promise<{ id: string }>;
}

export default function EditAdPage({ params }: EditAdPageProps) {
  const { id } = use(params);
  const { data: ad, isLoading, isError } = useAd(id);
  const user    = useAuthStore(selectUser);
  const isAdmin = useAuthStore(selectIsAdmin);
  const router  = useRouter();

  const isOwner = !!ad && !!user && (ad.userId === user.id || isAdmin);

  useEffect(() => {
    if (!isLoading && ad && !isOwner) {
      router.replace(ROUTES.myAds);
    }
  }, [isLoading, ad, isOwner, router]);

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  if (isError || !ad) return notFound();
  if (!isOwner) return null; // redirecting

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">تعديل الإعلان</h1>
      <EditAdForm ad={ad} />
    </div>
  );
}
