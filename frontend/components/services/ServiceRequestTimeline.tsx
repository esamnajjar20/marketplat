'use client';

import { CalendarClock, Check, Circle, Clock3, Play, Send, Star } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ServiceRequest, ServiceRequestStatus } from '@/types/service.types';
import { formatDateTime } from '@/lib/formatters';

interface Props {
  request: Pick<ServiceRequest, 'status' | 'createdAt' | 'respondedAt' | 'agreedPrice' | 'quotedPrice' | 'appointment' | 'review'>;
}

type Step = {
  key: string;
  label: string;
  icon: typeof Send;
  active: boolean;
  completed: boolean;
  meta?: string;
};

function statusRank(status: ServiceRequestStatus) {
  switch (status) {
    case 'PENDING': return 0;
    case 'ACCEPTED': return 1;
    case 'IN_PROGRESS': return 3;
    case 'COMPLETED': return 4;
    default: return -1;
  }
}

type TerminalStatus = 'REJECTED' | 'CANCELLED' | 'EXPIRED';

function isTerminalStatus(status: ServiceRequestStatus): status is TerminalStatus {
  return status === 'REJECTED' || status === 'CANCELLED' || status === 'EXPIRED';
}

export function ServiceRequestTimeline({ request }: Props) {
  const rank = statusRank(request.status);
  const hasAgreedPrice = Boolean(request.agreedPrice);
  const hasAppointment = Boolean(request.appointment);
  const appointmentDone = request.appointment?.status === 'COMPLETED';
  const hasReview = Boolean(request.review);

  if (isTerminalStatus(request.status)) {
    const labels: Record<TerminalStatus, string> = {
      REJECTED: 'تم رفض الطلب',
      CANCELLED: 'تم إلغاء الطلب',
      EXPIRED: 'انتهت صلاحية الطلب',
    };
    return (
      <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4" role="status">
        <div className="flex items-center gap-2 text-sm font-semibold text-destructive">
          <Circle className="h-4 w-4 fill-current" aria-hidden />
          {labels[request.status]}
        </div>
        <p className="mt-1 text-xs text-muted-foreground">تم إنشاء الطلب في {formatDateTime(request.createdAt)}</p>
      </div>
    );
  }

  const steps: Step[] = [
    { key: 'created', label: 'تم إرسال الطلب', icon: Send, active: rank === 0, completed: rank > 0 || request.status === 'PENDING', meta: formatDateTime(request.createdAt) },
    { key: 'accepted', label: 'رد مقدم الخدمة', icon: Check, active: rank === 1, completed: rank >= 1, meta: request.respondedAt ? formatDateTime(request.respondedAt) : undefined },
    { key: 'price', label: 'تم الاتفاق على السعر', icon: Clock3, active: hasAgreedPrice && rank < 3, completed: hasAgreedPrice, meta: request.agreedPrice ? `السعر المتفق عليه: ${request.agreedPrice}` : request.quotedPrice ? 'يوجد سعر مبدئي' : undefined },
    { key: 'appointment', label: 'الموعد', icon: CalendarClock, active: hasAppointment && !appointmentDone, completed: appointmentDone || hasAppointment, meta: request.appointment ? formatDateTime(request.appointment.scheduledStart) : 'بانتظار تحديد الموعد' },
    { key: 'progress', label: 'قيد التنفيذ', icon: Play, active: request.status === 'IN_PROGRESS', completed: rank >= 4, meta: request.status === 'IN_PROGRESS' ? 'الخدمة قيد التنفيذ' : undefined },
    { key: 'review', label: 'التقييم', icon: Star, active: hasReview, completed: hasReview, meta: hasReview ? 'تم إرسال التقييم' : request.status === 'COMPLETED' ? 'يمكنك تقييم الخدمة الآن' : undefined },
  ];

  return (
    <section aria-labelledby="request-progress-title" className="rounded-xl border bg-card p-4 sm:p-5">
      <div className="mb-4">
        <h2 id="request-progress-title" className="text-base font-semibold">تقدم الطلب</h2>
        <p className="mt-1 text-xs text-muted-foreground">تابع حالة طلبك والخطوة التالية بوضوح.</p>
      </div>
      <ol className="space-y-0">
        {steps.map((step, index) => {
          const Icon = step.icon;
          return (
            <li key={step.key} className="relative flex gap-3 pb-5 last:pb-0">
              {index < steps.length - 1 && (
                <span className={cn('absolute start-[13px] top-7 h-[calc(100%-8px)] w-px', step.completed ? 'bg-primary/50' : 'bg-border')} aria-hidden />
              )}
              <span className={cn('relative z-10 flex h-7 w-7 shrink-0 items-center justify-center rounded-full border', step.completed ? 'border-primary bg-primary text-primary-foreground' : step.active ? 'border-primary bg-primary/10 text-primary' : 'border-border bg-muted text-muted-foreground')}>
                <Icon className="h-3.5 w-3.5" aria-hidden />
              </span>
              <div className="min-w-0 pt-0.5">
                <p className={cn('text-sm font-medium', step.active || step.completed ? 'text-foreground' : 'text-muted-foreground')}>{step.label}</p>
                {step.meta && <p className="mt-0.5 text-xs text-muted-foreground">{step.meta}</p>}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
