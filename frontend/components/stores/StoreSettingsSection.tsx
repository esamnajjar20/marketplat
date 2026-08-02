'use client';

import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMyStore } from '@/hooks/queries/useStores';
import { BecomeStoreOwnerCard } from './BecomeStoreOwnerCard';
import { MyStoreCard } from './MyStoreCard';
import type { ParsedError } from '@/lib/errorParser';

/** Mirrors ServiceProviderSettingsSection's loading/error/CTA-vs-card shape exactly. */
export function StoreSettingsSection() {
  const { data: store, isLoading, isError, error, refetch } = useMyStore();

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  // Only a real 404 means "hasn't opened a store yet"; any other error
  // (network/5xx) shouldn't be conflated with that and silently show
  // the same "create a store" card as if the account vanished.
  const statusCode = (error as ParsedError | null)?.statusCode;

  if (isError && statusCode !== 404) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
        <p>تعذّر تحميل بيانات المتجر. يرجى المحاولة مرة أخرى.</p>
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

  if (isError || !store) {
    return <BecomeStoreOwnerCard />;
  }

  return <MyStoreCard store={store} />;
}
