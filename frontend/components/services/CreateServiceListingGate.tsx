'use client';

import { ServiceListingForm } from '@/components/services/ServiceListingForm';
import { RequireProfileGate } from '@/components/shared/gates/RequireProfileGate';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';
import { ROUTES } from '@/lib/constants';

/**
 * Gates service-listing creation behind having a ServiceProvider
 * profile — mirrors CreateAdGate/CreateProductGate. Previously
 * /my-services/new mounted ServiceListingForm directly with no
 * client-side check.
 */
export function CreateServiceListingGate() {
  const query = useMyServiceProvider();

  return (
    <RequireProfileGate
      query={query}
      setupHref={ROUTES.settings.serviceProvider}
      from={ROUTES.myServiceCreate}
      title="فعّل ملف مقدم الخدمة أولاً"
      description="تحتاج إلى تفعيل ملف مقدم خدمة قبل أن تتمكن من نشر خدماتك"
      ctaLabel="تفعيل ملف مقدم خدمة"
    >
      <ServiceListingForm mode="create" />
    </RequireProfileGate>
  );
}
