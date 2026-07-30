'use client';

import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';
import { BecomeServiceProviderCard } from './BecomeServiceProviderCard';
import { MyServiceProviderCard } from './MyServiceProviderCard';
import type { ParsedError } from '@/lib/errorParser';

export function ServiceProviderSettingsSection() {
  const { data: provider, isLoading, isError, error, refetch } = useMyServiceProvider();

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  // UX-FIX P1-5: mirrors the same fix in SellerSettingsSection — only a
  // real 404 means "hasn't activated service provider yet"; any other
  // error (network/5xx) should not be conflated with that and silently
  // show the same "become a provider" card as if the account vanished.
  const statusCode = (error as ParsedError | null)?.statusCode;

  if (isError && statusCode !== 404) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-center text-muted-foreground">
        <p>تعذّر تحميل بيانات مزود الخدمة. يرجى المحاولة مرة أخرى.</p>
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

  if (isError || !provider) {
    return <BecomeServiceProviderCard />;
  }

  return <MyServiceProviderCard provider={provider} />;
}
