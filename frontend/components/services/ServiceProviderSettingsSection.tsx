'use client';

import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';
import { BecomeServiceProviderCard } from './BecomeServiceProviderCard';
import { MyServiceProviderCard } from './MyServiceProviderCard';

export function ServiceProviderSettingsSection() {
  const { data: provider, isLoading, isError } = useMyServiceProvider();

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <LoadingSpinner />
      </div>
    );
  }

  // A 404 (isError, no data) just means the user hasn't activated
  // service provider yet — not a failure state. See useMyServiceProvider's
  // own comment on why this hook is called with retry: false.
  if (isError || !provider) {
    return <BecomeServiceProviderCard />;
  }

  return <MyServiceProviderCard provider={provider} />;
}
