'use client';

import { useState } from 'react';
import { CalendarDays, AlertTriangle } from 'lucide-react';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useAvailability } from '@/hooks/queries/useAppointments';
import { formatTime } from '@/lib/formatters';
import { cn } from '@/lib/utils';

interface Props {
  providerId: string;
  /** Called when the customer/provider taps a free range to prefill the booking dialog. */
  onSelectRange?: (range: { start: string; end: string }) => void;
  className?: string;
}

/** Today, in the browser's local timezone, as YYYY-MM-DD — matches
 * appointments.validation.ts's availabilitySchema date format. */
function todayIso(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/**
 * AvailabilityCalendar — Epic 4. Single-day view backed by the public
 * GET /appointments/availability/:providerId endpoint (appointments.service.ts's
 * getAvailability: workingHours for that weekday minus already-booked
 * SCHEDULED appointments). One day at a time, not a month grid — the
 * backend has no bulk/range availability endpoint to page through.
 */
export function AvailabilityCalendar({ providerId, onSelectRange, className }: Props) {
  const [date, setDate] = useState(todayIso());
  const { data, isLoading, isError, refetch } = useAvailability(providerId, date);

  return (
    <div className={cn('space-y-3', className)}>
      <div className="flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-muted-foreground shrink-0" />
        <input
          type="date"
          value={date}
          min={todayIso()}
          onChange={(e) => setDate(e.target.value)}
          className="rounded-md border border-input bg-transparent px-3 py-1.5 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
        />
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <LoadingSpinner />
        </div>
      )}

      {isError && (
        <div className="flex flex-col items-center gap-2 py-8 text-center">
          <AlertTriangle className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-destructive">تعذّر تحميل الأوقات المتاحة</p>
          <button type="button" onClick={() => refetch()} className="text-sm text-primary hover:underline">
            إعادة المحاولة
          </button>
        </div>
      )}

      {data && !data.available && (
        <EmptyState
          icon={<CalendarDays className="h-8 w-8" />}
          title="لا توجد أوقات متاحة"
          description="مقدم الخدمة غير متاح في هذا اليوم"
        />
      )}

      {data && data.available && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {data.freeRanges.map((range) => (
            <button
              key={range.start}
              type="button"
              onClick={() => onSelectRange?.(range)}
              className="rounded-md border px-3 py-2 text-sm text-center hover:bg-primary/10 hover:border-primary transition-colors"
            >
              {formatTime(range.start)} – {formatTime(range.end)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
