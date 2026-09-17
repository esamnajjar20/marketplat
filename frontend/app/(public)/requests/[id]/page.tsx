'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ArrowRight, MapPin, Wallet, CalendarClock } from 'lucide-react';
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
} from '@/lib/requestStatus';
import { formatRelativeTime } from '@/lib/formatters';
import { Badge } from '@/components/shared/ui/Badge';
import { Button } from '@/components/shared/ui/Button';
import { RequestOfferForm } from '@/components/requests/RequestOfferForm';
import { RequestOffersList } from '@/components/requests/RequestOffersList';
import { EmptyState } from '@/components/shared/feedback/EmptyState';

export default function RequestDetailPage() {
  const params = useParams();
  const id = String(params.id ?? '');
  const { data: request, isLoading, isError } = useRequestDetail(id);
  const user = useAuthStore(selectUser);
  const isAuthenticated = useAuthStore(selectIsAuthenticated);
  const cancel = useCancelRequest();

  if (isLoading) {
    return (
      <div className="mx-auto max-w-3xl space-y-4 px-3 py-4 pb-24 sm:p-4" dir="rtl" aria-busy>
        <div className="h-4 w-24 animate-pulse rounded bg-muted" />
        <div className="h-8 w-2/3 animate-pulse rounded bg-muted" />
        <div className="h-24 animate-pulse rounded-xl bg-muted" />
      </div>
    );
  }

  if (isError || !request) {
    return (
      <div className="mx-auto max-w-3xl px-3 py-4 pb-24 sm:p-4" dir="rtl">
        <EmptyState
          title="الطلب غير موجود"
          description="قد يكون محذوفًا أو الرابط غير صحيح."
          action={
            <Button asChild variant="outline" className="min-h-11">
              <Link href={ROUTES.requests}>العودة لسوق الطلبات</Link>
            </Button>
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
  const hiddenForCompetition =
    !isOwner && offers.length === 0 && request.status === 'OPEN';
  const canOffer = isAuthenticated && !isOwner && request.status === 'OPEN';
  const loginHref = `${ROUTES.login}?from=${encodeURIComponent(`/requests/${id}`)}`;

  return (
    <div className="mx-auto max-w-3xl space-y-5 px-3 py-4 pb-28 sm:space-y-6 sm:p-4 sm:pb-10" dir="rtl">
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
          {request.city && (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <MapPin className="h-3.5 w-3.5" aria-hidden />
              {request.city}
            </span>
          )}
        </div>

        <h1 className="text-xl font-bold tracking-tight leading-snug sm:text-2xl">
          {request.title}
        </h1>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {request.createdAt && <span>نُشر {formatRelativeTime(request.createdAt)}</span>}
          {request.customer?.name && <span>· {request.customer.name}</span>}
          {request.expiresAt && (
            <span className="inline-flex items-center gap-1">
              <CalendarClock className="h-3.5 w-3.5" aria-hidden />
              ينتهي {new Date(request.expiresAt).toLocaleDateString('ar')}
            </span>
          )}
        </div>
      </header>

      <div className="rounded-xl border border-border/80 bg-card p-4 shadow-xs">
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground/90">
          {request.description}
        </p>
        {budget && (
          <p className="mt-4 inline-flex items-center gap-1.5 text-sm font-medium">
            <Wallet className="h-4 w-4 text-muted-foreground" aria-hidden />
            الميزانية: {budget}
          </p>
        )}
      </div>

      {images.length > 0 && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((url) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={url}
              src={url}
              alt=""
              className="h-28 w-full rounded-xl object-cover border border-border/50 sm:h-32"
            />
          ))}
        </div>
      )}

      {isOwner && request.status === 'OPEN' && (
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            className="min-h-11"
            disabled={cancel.isPending}
            onClick={() => {
              if (window.confirm('إلغاء هذا الطلب؟ لن يستقبل عروضًا جديدة.')) {
                cancel.mutate(id);
              }
            }}
          >
            إلغاء الطلب
          </Button>
          <Button variant="ghost" className="min-h-11" asChild>
            <Link href={ROUTES.myRequests}>طلباتي</Link>
          </Button>
        </div>
      )}

      {/* Desktop / inline offer form for logged-in non-owners */}
      {canOffer && (
        <div id="offer-form" className="scroll-mt-24">
          <RequestOfferForm requestId={id} myOffer={myOffer} />
        </div>
      )}

      {!isAuthenticated && request.status === 'OPEN' && !isOwner && (
        <div className="hidden rounded-xl border border-dashed p-4 text-center sm:block">
          <p className="text-sm text-muted-foreground mb-3">
            سجّل الدخول لتقديم عرض على هذا الطلب
          </p>
          <Button asChild className="min-h-11">
            <Link href={loginHref}>تسجيل الدخول</Link>
          </Button>
        </div>
      )}

      {!isOwner && request.status !== 'OPEN' && (
        <p className="text-sm text-muted-foreground rounded-lg border border-dashed p-3">
          هذا الطلب لم يعد مفتوحًا لاستقبال عروض جديدة.
        </p>
      )}

      <RequestOffersList
        requestId={id}
        offers={offers}
        isOwner={isOwner}
        requestStatus={request.status}
        hiddenForCompetition={hiddenForCompetition}
      />

      {/* Mobile sticky bottom CTA — above BottomNav (pb-16 layout) */}
      {!isOwner && request.status === 'OPEN' && (
        <div
          className="fixed inset-x-0 bottom-16 z-20 border-t border-border/80 bg-card/95 p-3 backdrop-blur md:hidden"
          style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
        >
          {isAuthenticated ? (
            <Button asChild className="h-12 w-full text-base">
              <a href="#offer-form">قدّم عرضًا</a>
            </Button>
          ) : (
            <Button asChild className="h-12 w-full text-base">
              <Link href={loginHref}>سجّل الدخول لتقديم عرض</Link>
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
