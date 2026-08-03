'use client';

/**
 * Edit my ad page — canonical implementation, Protected Client Component.
 *
 * AUDIT-FIX (protected — file organization): this used to be one of two
 * independent implementations of the same page, alongside
 * /ads/[id]/edit. That route is now a redirect here; this is the single
 * canonical "edit my ad" page, grouped with the rest of the my-ads/* tree.
 *
 * FIX BUILD-02: EditAdForm only accepts `{ ad: Ad }`, not `adId` — it
 * has no data-fetching of its own, so this page fetches via useAd(id)
 * and passes the resolved ad down.
 *
 * FIX UX-14: ownership check before rendering — a user could otherwise
 * open this page for anyone's ad by guessing/pasting the URL, fill out
 * the whole edit form, and only find out on save (via the backend's
 * real 403 in ads.service.ts's updateAd) that they never had
 * permission. Not a security gap (the backend already enforces this
 * correctly), but a confusing dead end.
 *
 * AUDIT-FIX (protected #7): shares useOwnershipGuard with the other
 * three edit pages instead of hand-rolling the same redirect effect.
 */
import { use }      from 'react';
import { notFound } from 'next/navigation';
import { EditAdForm }     from '@/components/ads/EditAdForm';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useAd }          from '@/hooks/queries/useAds';
import { useAuthStore, selectUser, selectIsAdmin } from '@/store/auth.store';
import { useOwnershipGuard } from '@/hooks/useOwnershipGuard';
import { ROUTES } from '@/lib/constants';

interface EditAdPageProps {
  params: Promise<{ id: string }>;
}

export default function EditAdPage({ params }: EditAdPageProps) {
  const { id } = use(params);
  const { data: ad, isLoading, isError } = useAd(id);
  const user    = useAuthStore(selectUser);
  const isAdmin = useAuthStore(selectIsAdmin);

  const isOwner = !!ad && !!user && (ad.userId === user.id || isAdmin);
  const isRedirecting = useOwnershipGuard({ isLoading, item: ad, isOwner, redirectTo: ROUTES.myAds });

  if (isLoading) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  if (isError || !ad) return notFound();
  if (isRedirecting) return null;

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">تعديل الإعلان</h1>
      <EditAdForm ad={ad} />
    </div>
  );
}
