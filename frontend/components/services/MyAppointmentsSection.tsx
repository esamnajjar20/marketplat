'use client';

import { CalendarClock } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { AppointmentsList } from './AppointmentsList';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';

/**
 * MyAppointmentsSection — resolves the caller's own provider profile
 * before rendering AppointmentsList (which needs a concrete providerId
 * for its "حجز موعد جديد" dialog). A missing provider profile (404) is
 * treated as "not a provider yet", same convention useMyServiceProvider's
 * own doc comment describes — not an error state.
 */
export function MyAppointmentsSection() {
  const { data: provider, isLoading, isError } = useMyServiceProvider();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError || !provider) {
    return (
      <EmptyState
        icon={<CalendarClock className="h-10 w-10" />}
        title="لست مقدم خدمة بعد"
        description="أنشئ ملف مقدم خدمة أولاً من إعدادات الحساب لتتمكن من إدارة المواعيد"
      />
    );
  }

  return <AppointmentsList providerId={provider.id} />;
}
