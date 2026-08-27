'use client';

import { use, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { serviceBroadcastsApi } from '@/api/service-broadcasts.api';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { ROUTES } from '@/lib/constants';
import { formatRelativeTime } from '@/lib/formatters';
import { toast } from 'sonner';

export default function ServiceBroadcastDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = use(params);
  const qc = useQueryClient();
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
    onError: () => toast.error('تعذّر إرسال العرض'),
  });

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

      {data.status === 'OPEN' && (
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
