'use client';

import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { BecomeSellerCard } from './BecomeSellerCard';
import { MySellerProfileCard } from './MySellerProfileCard';

export function SellerSettingsSection() {
  const { data: profile, isLoading, isError } = useMySellerProfile();

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  // A 404 (isError, no data) just means the user hasn't created a
  // seller profile yet — not a failure state. See useMySellerProfile's
  // own comment on why this hook is called with retry: false.
  if (isError || !profile) {
    return <BecomeSellerCard />;
  }

  return <MySellerProfileCard profile={profile} />;
}
