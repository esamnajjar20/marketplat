'use client';

/**
 * Edit my service listing page — Protected Client Component.
 * Ownership check: ServiceListing has no userId field directly (it
 * belongs to a ServiceProviderDetails, which belongs to a
 * SellerProfile, which belongs to a User) — same indirection ads.userId
 * doesn't have to deal with. Rather than resolve that chain client-side,
 * this checks membership in the caller's own /service-listings/me list,
 * which the backend already scopes to the authenticated provider.
 */
import { use, useEffect } from 'react';
import { notFound, useRouter } from 'next/navigation';
import { ServiceListingForm } from '@/components/services/ServiceListingForm';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useServiceListing, useMyServiceListings } from '@/hooks/queries/useServiceListings';
import { ROUTES } from '@/lib/constants';

interface Props {
  params: Promise<{ id: string }>;
}

export default function EditServiceListingPage({ params }: Props) {
  const { id } = use(params);
  const { data: listing, isLoading, isError } = useServiceListing(id);
  const { data: mine, isLoading: isLoadingMine } = useMyServiceListings({ limit: 100 });
  const router = useRouter();

  const isOwner = !!listing && !!mine && mine.items.some((l) => l.id === listing.id);
  const isLoadingOwnership = isLoading || isLoadingMine;

  useEffect(() => {
    if (!isLoadingOwnership && listing && !isOwner) {
      router.replace(ROUTES.myServices);
    }
  }, [isLoadingOwnership, listing, isOwner, router]);

  if (isLoadingOwnership) return <div className="flex justify-center py-20"><LoadingSpinner /></div>;
  if (isError || !listing) return notFound();
  if (!isOwner) return null; // redirecting

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <h1 className="text-2xl font-bold mb-6">تعديل الخدمة</h1>
      <ServiceListingForm mode="edit" listing={listing} />
    </div>
  );
}
