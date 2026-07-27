'use client';

/**
 * FIX UX-14: no ownership check on the frontend — a user could open
 * this page for anyone's ad by guessing/pasting the URL, fill out the
 * whole edit form, and only find out on save (via the backend's real
 * 403 in ads.service.ts's updateAd) that they never had permission.
 * Not a security gap (the backend already enforces this correctly),
 * but a confusing dead end. Redirects away before the form ever
 * renders, the same way an unauthenticated visit to a /(protected)
 * route would be redirected.
 */
import { use }            from 'react';
import { EditAdForm }     from '@/components/ads/EditAdForm';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useAd }          from '@/hooks/queries/useAds';
import { useAuthStore, selectUser, selectIsAdmin } from '@/store/auth.store';
import { notFound, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { ROUTES } from '@/lib/constants';

export default function EditAdPage({ params }: { params: Promise<{ id: string }> }) {
  const { id }  = use(params);
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
    <div className="max-w-2xl mx-auto space-y-4">
      <h1 className="text-xl font-bold">تعديل الإعلان</h1>
      <EditAdForm ad={ad} />
    </div>
  );
}
