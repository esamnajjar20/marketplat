'use client';

import { CalendarClock } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { AppointmentsList } from './AppointmentsList';
import { useMyServiceProvider } from '@/hooks/queries/useServiceProviders';
import type { ParsedError } from '@/lib/errorParser';

/**
 * MyAppointmentsSection — resolves the caller's own provider profile
 * before rendering AppointmentsList (which needs a concrete providerId
 * for its "حجز موعد جديد" dialog). A missing provider profile (404) is
 * treated as "not a provider yet", same convention useMyServiceProvider's
 * own doc comment describes — not an error state.
 */
export function MyAppointmentsSection() {
  const { data: provider, isLoading, isError, error, refetch } = useMyServiceProvider();

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  // FIX APPOINTMENTS-404-VS-ERROR: the previous branch collapsed
  // every failure into "لست مقدم خدمة بعد" — including 5xx and
  // network errors. A real provider opening this page during a
  // transient backend hiccup was told they are not a provider yet,
  // which is both wrong and, worse, wrong in a way that suggests
  // their profile is missing. MyServicesHub already distinguishes
  // the two: a 404 means "no provider profile yet", anything else
  // is a real error worth retrying. Same convention here.
  const statusCode = (error as ParsedError | null)?.statusCode;

  if (isError && statusCode !== 404) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
        <p>تعذّر تحميل بيانات المواعيد. يرجى المحاولة مرة أخرى.</p>
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
