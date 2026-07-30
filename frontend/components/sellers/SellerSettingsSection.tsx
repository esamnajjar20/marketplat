'use client';

import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMySellerProfile } from '@/hooks/queries/useSellers';
import { BecomeSellerCard } from './BecomeSellerCard';
import { MySellerProfileCard } from './MySellerProfileCard';
import type { ParsedError } from '@/lib/errorParser';

export function SellerSettingsSection() {
  const { data: profile, isLoading, isError, error, refetch } = useMySellerProfile();

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  // UX-FIX P1-5: a 404 genuinely means "no seller profile yet" — that's
  // the expected, common case and should show BecomeSellerCard. But any
  // OTHER error (network failure, 500, etc.) was previously treated
  // identically, so an existing seller whose profile fetch failed for an
  // unrelated reason would see "become a seller" as if their account had
  // vanished. client.ts's interceptor already runs every error through
  // parseApiError before it reaches here, so `error.statusCode` is
  // reliable to check directly.
  const statusCode = (error as ParsedError | null)?.statusCode;

  if (isError && statusCode !== 404) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
        <p>تعذّر تحميل بيانات البائع. يرجى المحاولة مرة أخرى.</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="text-sm text-primary hover:underline"
        >
          إعادة المحاولة
        </button>
      </div>
    );
  }

  if (isError || !profile) {
    return <BecomeSellerCard />;
  }

  return <MySellerProfileCard profile={profile} />;
}
