'use client';

import { useEffect, useState } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import { AlertTriangle, CalendarClock, CalendarPlus, CheckCheck, X, UserX } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Badge } from '@/components/shared/ui/Badge';
import { Pagination } from '@/components/shared/ui/Pagination';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { useMyAppointments } from '@/hooks/queries/useAppointments';
import { useUpdateAppointmentStatus } from '@/hooks/mutations/useAppointmentMutations';
import { CreateAppointmentDialog } from './CreateAppointmentDialog';
import { ROUTES } from '@/lib/constants';
import { formatDateTime } from '@/lib/formatters';
import {
  APPOINTMENT_STATUS_LABELS,
  APPOINTMENT_STATUS_VARIANT,
} from '@/lib/appointmentStatus';

interface Props {
  /** The caller's own ServiceProviderDetails.id — needed to open the
   * booking dialog (it drives AvailabilityCalendar's lookup). */
  providerId: string;
}

/** One appointment row's action buttons — only legal from SCHEDULED
 * (appointments.service.ts's own guard: "Only a scheduled appointment
 * can change status"). */
function AppointmentActions({ id, status }: { id: string; status: string }) {
  const updateStatus = useUpdateAppointmentStatus();

  if (status !== 'SCHEDULED') return null;

  return (
    <div className="flex gap-1.5 shrink-0">
      <Button
        size="sm"
        variant="outline"
        className="gap-1"
        disabled={updateStatus.isPending}
        onClick={() => updateStatus.mutate({ id, payload: { status: 'NO_SHOW' } })}
      >
        <UserX className="h-3.5 w-3.5" />لم يحضر
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="gap-1 text-destructive hover:text-destructive"
        disabled={updateStatus.isPending}
        onClick={() => updateStatus.mutate({ id, payload: { status: 'CANCELLED' } })}
      >
        <X className="h-3.5 w-3.5" />إلغاء
      </Button>
      <Button
        size="sm"
        className="gap-1"
        disabled={updateStatus.isPending}
        onClick={() => updateStatus.mutate({ id, payload: { status: 'COMPLETED' } })}
      >
        <CheckCheck className="h-3.5 w-3.5" />إنهاء
      </Button>
    </div>
  );
}

/**
 * AppointmentsList — Epic 4, provider-side calendar at
 * /my-services/appointments. Mirrors IncomingServiceRequestsList's
 * shape: URL-driven pagination, status filter tabs, and a per-row
 * action set gated on the row's own status.
 */
export function AppointmentsList({ providerId }: Props) {
  const sp = useSearchParams();
  const router = useRouter();
  const page = Number(sp.get('page') ?? 1);
  const [createOpen, setCreateOpen] = useState(false);

  const { data, isLoading, isError, refetch } = useMyAppointments({ page, limit: 10 });

  const items = data?.items ?? [];
  const totalPages = data?.meta?.totalPages ?? 1;

  useEffect(() => {
    if (!data) return;
    if (page > totalPages && totalPages >= 1) {
      const params = new URLSearchParams(sp.toString());
      if (totalPages > 1) params.set('page', String(totalPages));
      else params.delete('page');
      router.replace(`${ROUTES.myServiceAppointments}?${params.toString()}`);
    }
  }, [data, page, totalPages, sp, router]);

  const isOutOfRange = !!data && page > totalPages && totalPages >= 1;

  if (isLoading || isOutOfRange) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">حدث خطأ أثناء تحميل المواعيد</p>
        <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button onClick={() => setCreateOpen(true)} className="gap-1.5">
          <CalendarPlus className="h-4 w-4" />
          حجز موعد جديد
        </Button>
      </div>

      {items.length === 0 ? (
        <EmptyState
          icon={<CalendarClock className="h-10 w-10" />}
          title="لا توجد مواعيد"
          description="لم تحجز أي مواعيد بعد"
        />
      ) : (
        <div className="space-y-3">
          {items.map((appointment) => (
            <div
              key={appointment.id}
              className="flex flex-col gap-3 p-3 rounded-lg border bg-card sm:flex-row sm:items-center"
            >
              <div className="flex-1 min-w-0 space-y-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-medium text-sm">{formatDateTime(appointment.scheduledStart)}</p>
                  <Badge variant={APPOINTMENT_STATUS_VARIANT[appointment.status]} className="shrink-0 text-xs">
                    {APPOINTMENT_STATUS_LABELS[appointment.status]}
                  </Badge>
                </div>
                {appointment.notes && (
                  <p className="text-sm text-muted-foreground line-clamp-2">{appointment.notes}</p>
                )}
              </div>
              <AppointmentActions id={appointment.id} status={appointment.status} />
            </div>
          ))}
        </div>
      )}

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.myServiceAppointments}
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}

      <CreateAppointmentDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        providerId={providerId}
      />
    </div>
  );
}
