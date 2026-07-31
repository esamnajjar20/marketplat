'use client';

import Link from 'next/link';
import { Store } from 'lucide-react';
import { CreateAdForm } from '@/components/ads/CreateAdForm';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Button } from '@/components/shared/ui/Button';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { ROUTES } from '@/lib/constants';

/**
 * Gates ad creation behind having a SellerProfile — checked client-side
 * before the (heavier, multi-field, image-upload) CreateAdForm ever
 * mounts, rather than letting the user fill the whole form and only
 * then hit the backend's BadRequestError from
 * ensureSellerProfileForAdCreation (ads.service.ts's createAd).
 *
 * Only sellers may publish ads — this is intentional product behavior,
 * not a bug. Keep this gate and the backend's
 * ensureSellerProfileForAdCreation call in sync: removing one without
 * the other reopens the exact mismatch this component's history has
 * already hit once (frontend blocking everyone vs. backend allowing
 * everyone).
 */
export function CreateAdGate() {
  const { data: profile, isLoading, isError } = useMySellerProfile();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError || !profile) {
    return (
      <EmptyState
        icon={<Store className="h-8 w-8" />}
        title="أنشئ ملف البائع أولاً"
        description="تحتاج إلى إنشاء ملف بائع قبل أن تتمكن من نشر إعلانات على المنصة"
        action={
          <Button asChild>
            <Link href={ROUTES.settings.seller}>إنشاء ملف البائع</Link>
          </Button>
        }
      />
    );
  }

  return <CreateAdForm />;
}
