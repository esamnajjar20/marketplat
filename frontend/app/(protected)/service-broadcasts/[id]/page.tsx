'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { CheckCircle2 } from 'lucide-react';
import { serviceBroadcastsApi } from '@/api/service-broadcasts.api';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { Badge } from '@/components/shared/ui/Badge';
import { ROUTES } from '@/lib/constants';
import { formatPrice, formatRelativeTime } from '@/lib/formatters';
import { toastMutationError } from '@/lib/mutationFeedback';
import { SERVICE_QUOTE_STATUS_LABELS, SERVICE_QUOTE_STATUS_VARIANT } from '@/lib/serviceQuoteStatus';
import { useAuthStore, selectUser } from '@/store/auth.store';
import { useWithdrawServiceQuote, useAcceptServiceQuote } from '@/hooks/mutations/useServiceBroadcastMutations';
import { toast } from 'sonner';
import type { ServiceQuoteListItem } from '@/api/service-broadcasts.api';

export default function ServiceBroadcastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();
  const currentUser = useAuthStore(selectUser);
  const [price, setPrice] = useState('');
  const [message, setMessage] = useState('');

  const { data, isLoading, isError } = useQuery({
    queryKey: ['service-broadcasts', id],
    queryFn: () => serviceBroadcastsApi.getById(id).then((r) => r.data.data),
  });

  const quote = useMutation({
    mutationFn: () =>
      serviceBroadcastsApi.submitQuote(id, {
        price: Number(price),
        message: message.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success('تم إرسال العرض');
      setPrice('');
      setMessage('');
      void qc.invalidateQueries({ queryKey: ['service-broadcasts', id] });
    },
    onError: toastMutationError,
  });

  const withdrawQuote = useWithdrawServiceQuote(id);
  const acceptQuote = useAcceptServiceQuote(id);

  if (isLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }
  if (isError || !data) {
    return <p className="text-destructive text-center py-8">تعذّر تحميل الطلب</p>;
  }

  const isOwner = Boolean(currentUser && data.customerId === currentUser.id);
  const quotes: ServiceQuoteListItem[] = data.quotes ?? [];
  const myQuote = currentUser
    ? quotes.find((q) => q.provider?.sellerProfile.userId === currentUser.id)
    : undefined;
  // Owners never quote on their own broadcast (backend rejects it —
  // see service-broadcasts.service.ts's CANNOT_QUOTE_OWN_BROADCAST), so
  // the form is hidden for them entirely rather than surfacing that as
  // a submit-time error. Anyone who already has a quote edits it below
  // by re-submitting (same "revision reuses the same row" behavior the
  // backend already implements) instead of seeing a duplicate form.
  const canSubmitQuote = data.status === 'OPEN' && !isOwner && !myQuote;

  return (
    <div className="space-y-6 max-w-lg">
      <Link href={ROUTES.serviceBroadcasts} className="text-sm text-primary hover:underline">
        ← سوق الطلبات
      </Link>
      <div className="space-y-2">
        <h1 className="text-xl font-bold">{data.title}</h1>
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{data.description}</p>
        <p className="text-xs text-muted-foreground">
          {data.city ? `${data.city} · ` : ''}
          {formatRelativeTime(data.createdAt)} · {data.status}
        </p>
      </div>

      {isOwner && (
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-muted-foreground">
            العروض المقدَّمة ({quotes.length})
          </h2>
          {quotes.length === 0 ? (
            <EmptyState title="لا عروض بعد" description="سيظهر مزودو الخدمة هنا فور تقديم عروضهم" />
          ) : (
            <ul className="space-y-3">
              {quotes.map((q) => (
                <li key={q.id} className="rounded-lg border bg-card p-4 space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-medium">
                      {q.provider?.sellerProfile.displayName ?? 'مزود خدمة'}
                    </span>
                    <Badge variant={SERVICE_QUOTE_STATUS_VARIANT[q.status]}>
                      {SERVICE_QUOTE_STATUS_LABELS[q.status]}
                    </Badge>
                  </div>
                  <p className="text-primary font-bold">{formatPrice(q.price)}</p>
                  {q.message && <p className="text-sm text-muted-foreground">{q.message}</p>}
                  {data.status === 'OPEN' && q.status === 'PENDING' && (
                    <Button
                      size="sm"
                      className="gap-1.5"
                      disabled={acceptQuote.isPending}
                      onClick={() => acceptQuote.mutate(q.id)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      {acceptQuote.isPending ? 'جارٍ القبول…' : 'قبول العرض'}
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {myQuote && (
        <div className="space-y-3 rounded-lg border p-4">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">عرضك</h2>
            <Badge variant={SERVICE_QUOTE_STATUS_VARIANT[myQuote.status]}>
              {SERVICE_QUOTE_STATUS_LABELS[myQuote.status]}
            </Badge>
          </div>
          <p className="text-primary font-bold">{formatPrice(myQuote.price)}</p>
          {myQuote.status === 'PENDING' && (
            <Button
              variant="outline"
              size="sm"
              disabled={withdrawQuote.isPending}
              onClick={() => withdrawQuote.mutate(myQuote.id)}
            >
              {withdrawQuote.isPending ? 'جارٍ السحب…' : 'سحب العرض'}
            </Button>
          )}
        </div>
      )}

      {canSubmitQuote && (
        <form
          className="space-y-3 rounded-lg border p-4"
          onSubmit={(e) => {
            e.preventDefault();
            if (!price || Number(price) <= 0) {
              toast.error('أدخل سعراً صالحاً');
              return;
            }
            quote.mutate();
          }}
        >
          <h2 className="text-sm font-semibold">قدّم عرض سعر</h2>
          <Input
            type="number"
            min={1}
            step="0.01"
            placeholder="السعر"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
          />
          <Input
            placeholder="رسالة اختيارية"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <Button type="submit" disabled={quote.isPending} className="w-full">
            {quote.isPending ? 'جارٍ الإرسال…' : 'إرسال العرض'}
          </Button>
        </form>
      )}
    </div>
  );
}
