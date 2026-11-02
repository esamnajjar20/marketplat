'use client';

import dynamic from 'next/dynamic';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';

import { useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, MapPin, CalendarClock, Clock, MessageSquare } from 'lucide-react';
import { useRequestDetail } from '@/hooks/queries/useRequests';
import { useCancelRequest } from '@/hooks/mutations/useRequestMutations';
import { useAuthStore, selectUser, selectIsAuthenticated } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import {
  REQUEST_STATUS_LABEL,
  REQUEST_STATUS_VARIANT,
  REQUEST_TYPE_LABEL,
  REQUEST_TYPE_VARIANT,
  formatRequestBudget,
  formatOffersCount,
  isRequestExpiringSoon,
} from '@/lib/requestStatus';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { SafeImg } from '@/components/shared/ui/SafeImg';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { parseApiError } from '@/lib/errorParser';
import { ConfirmDialog } from '@/components/shared/feedback/ConfirmDialog';

const RequestOfferForm = dynamic(
  () =>
    import('@/components/requests/RequestOfferForm').then(
      (module) => module.RequestOfferForm,
    ),
);
const RequestOffersList = dynamic(
  () =>
    import('@/components/requests/RequestOffersList').then(
      (module) => module.RequestOffersList,
    ),
);

export default function RequestDetailPage() {
  const params = useParams();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const id = String(params.id ?? '');
  const { data: request, isLoading, isError, error } = useRequestDetail(id);
  const user = useAuthStore(selectUser);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const cancel = useCancelRequest();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-3 py-4 pb-4 sm:p-4" dir="rtl" aria-busy>
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
        <div className="h-32 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (isError || !request) {
    const statusCode = parseApiError(error).statusCode;
    const notFound = statusCode === 404;
    return (
      <div className="mx-auto max-w-3xl px-3 py-4 pb-24 sm:p-4" dir="rtl">
        <EmptyState
          title={notFound ? 'الطلب غير موجود' : 'تعذّر تحميل الطلب'}
          description={notFound ? 'قد يكون محذوفًا أو الرابط غير صحيح.' : 'تحقق من الاتصال ثم أعد المحاولة.'}
          action={
            <div className="flex flex-wrap justify-center gap-2">
              {!notFound && (
                <Button variant="outline" className="min-h-11" onClick={() => window.location.reload()}>
                  إعادة المحاولة
                </Button>
              )}
              <Button asChild variant={notFound ? 'default' : 'ghost'} className="min-h-11">
                <Link href={ROUTES.requests}>العودة لسوق الطلبات</Link>
              </Button>
            </div>
          }
        />
      </div>
    );
  }

  const isOwner = Boolean(user?.id && user.id === request.customerId);
  const myOffer = request.offers?.find((o) => o.offererUserId === user?.id);
  const images = request.attachedImages ?? [];
  const budget = formatRequestBudget(request.budgetMin, request.budgetMax);
  const offers = request.offers ?? [];
  const offersCount = request._count?.offers ?? offers.length;
  const hiddenForCompetition =
    !isOwner && request.status === 'OPEN' && offers.length < offersCount;
  const canOffer = isAuthenticated && !isOwner && request.status === 'OPEN';
  const loginHref = `${ROUTES.login}?from=${encodeURIComponent(`/requests/${id}`)}`;
  const expiringSoon = isRequestExpiringSoon(request.expiresAt);

  return (
    <div
      className={`mx-auto max-w-3xl space-y-5 px-3 py-4 sm:space-y-6 sm:p-4 sm:pb-10 ${!isOwner && request.status === 'OPEN' ? 'pb-sticky-contact' : 'pb-4'}`}
      dir="rtl"
    >
      <div>
        <Link
          href={ROUTES.requests}
          className="inline-flex min-h-10 items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowRight className="h-4 w-4" aria-hidden />
          سوق الطلبات
        </Link>
      </div>

      <header className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={REQUEST_STATUS_VARIANT[request.status]}>
            {REQUEST_STATUS_LABEL[request.status]}
          </Badge>
          <Badge variant={REQUEST_TYPE_VARIANT[request.type]}>
            {REQUEST_TYPE_LABEL[request.type]}
          </Badge>
          {expiringSoon && request.status === 'OPEN' && (
            <Badge
              variant="outline"
              className="border-warning/50 bg-warning/10 text-warning-strong dark:text-warning"
            >
              <Clock className="me-1 h-3.5 w-3.5" aria-hidden />
              ينتهي قريبًا
            </Badge>
          )}
          {request.city && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {request.city}
            </span>
          )}
        </div>

        <h1 className="text-xl font-extrabold tracking-tight leading-snug sm:text-2xl">
          {request.title}
        </h1>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {request.createdAt && <span>نُشر {<HydrationSafeRelativeTime date={request.createdAt} />}</span>}
          {request.customer?.name && <span>· {request.customer.name}</span>}
          {request.expiresAt && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              ينتهي {new Date(request.expiresAt).toLocaleDateString('ar', { timeZone: 'Asia/Gaza' })}
            </span>
          )}
          {request.status === 'OPEN' && (
            <span className="inline-flex items-center gap-1">
              <MessageSquare className="h-3.5 w-3.5" aria-hidden />
              {formatOffersCount(offersCount)}
            </span>
          )}
        </div>
      </header>

      {/* Value summary — soft beige tiles matching design */}
      <div className="grid grid-cols-1 gap-2 min-[420px]:grid-cols-3">
        <div className="rounded-xl bg-[var(--legacy-surface)] p-2.5 text-center sm:p-3">
          <p className="text-[11px] text-[var(--legacy-muted-text)]">الميزانية</p>
          <p className="mt-0.5 text-[15px] font-extrabold tabular-nums text-foreground">
            {budget ?? 'مفتوحة'}
          </p>
        </div>
        <div className="rounded-xl bg-[var(--legacy-surface)] p-2.5 text-center sm:p-3">
          <p className="text-[11px] text-[var(--legacy-muted-text)]">العروض</p>
          <p className="mt-0.5 text-[15px] font-extrabold">{offersCount}</p>
        </div>
        <div className="rounded-xl bg-[var(--legacy-surface)] p-2.5 text-center sm:p-3">
          <p className="text-[11px] text-[var(--legacy-muted-text)]">المدينة</p>
          <p className="mt-0.5 text-[15px] font-extrabold">{request.city ?? '—'}</p>
        </div>
      </div>

      {request.description && (
        <div className="rounded-xl bg-[var(--legacy-surface)] px-3.5 py-3">
          <p className="whitespace-pre-wrap text-[13px] leading-[1.9] text-[var(--legacy-foreground-warm)]">
            {request.description}
          </p>
        </div>
      )}

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((src, i) => (
            <SafeImg
              key={i}
              src={src}
              alt={`صورة مرفقة ${i + 1}`}
              className="aspect-square w-full rounded-lg border object-cover"
            />
          ))}
        </div>
      )}

      {isOwner && request.status === 'OPEN' && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="destructive"
            className="min-h-11"
            disabled={cancel.isPending}
            onClick={() => setConfirmCancel(true)}
          >
            إلغاء الطلب
          </Button>
          <Button variant="ghost" className="min-h-11" asChild>
            <Link href={ROUTES.myOpenRequests}>طلباتي</Link>
          </Button>
        </div>
      )}

      {canOffer && (
        <div id="offer-form" className="scroll-mt-24">
          <RequestOfferForm requestId={id} myOffer={myOffer} />
        </div>
      )}

      {!isAuthenticated && request.status === 'OPEN' && !isOwner && (
        <div className="flex items-center justify-between gap-3 rounded-2xl border border-[var(--legacy-primary-border)] bg-[var(--legacy-primary-soft)] p-3.5">
          <span className="text-[13px] font-bold text-[var(--legacy-primary-deep)]">سجّل الدخول لتقديم عرض على هذا الطلب</span>
          <Button asChild className="h-9 shrink-0 rounded-xl text-sm font-bold">
            <Link href={loginHref}>تسجيل الدخول</Link>
          </Button>
        </div>
      )}

      {!isOwner && request.status !== 'OPEN' && (
        <div className="rounded-xl border border-[var(--legacy-warning-border)] bg-[var(--legacy-warning-soft)] px-3.5 py-3 text-[13px] leading-relaxed text-[var(--legacy-warning-deep)]">
          ⚠ هذا الطلب لم يعد مفتوحًا لاستقبال عروض جديدة.
        </div>
      )}

      <RequestOffersList
        requestId={id}
        offers={offers}
        isOwner={isOwner}
        requestStatus={request.status}
        hiddenForCompetition={hiddenForCompetition}
        totalOffersCount={offersCount}
      />

      {/* Mobile sticky CTA — matches design mockup */}
      {!isOwner && request.status === 'OPEN' && (
        <div
          className="sticky-contact-bar fixed inset-x-0 z-40 border-t border-border bg-card/95 px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] shadow-[0_-4px_16px_-8px_hsl(var(--shadow-color)/0.12)] backdrop-blur md:hidden"
        >
          <div className="mx-auto flex max-w-3xl items-center gap-2.5">
            <div className="min-w-0 flex-1">
              <div className="text-[11px] text-[var(--legacy-muted-text)]">الميزانية</div>
              <b className="text-[15px] font-extrabold text-[var(--legacy-primary-deep)] tabular-nums">
                {budget ?? 'مفتوحة'}
              </b>
            </div>
            {isAuthenticated ? (
              <Button asChild className="h-11 flex-[1.6] rounded-xl text-sm font-bold">
                <a href="#offer-form">قدّم عرضًا</a>
              </Button>
            ) : (
              <Button asChild className="h-11 flex-[1.6] rounded-xl text-sm font-bold">
                <Link href={loginHref}>سجّل الدخول</Link>
              </Button>
            )}
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmCancel}
        onOpenChange={setConfirmCancel}
        title="إلغاء هذا الطلب؟"
        description="لن يستقبل عروضًا جديدة."
        confirmLabel="إلغاء الطلب"
        destructive
        isPending={cancel.isPending}
        onConfirm={() => {
          cancel.mutate(id, { onSuccess: () => setConfirmCancel(false) });
        }}
      />
    </div>
  );
}
