'use client';

import { useMemo, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { ArrowRight, CheckCircle2, Package, Truck, XCircle } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { useMarketplaceOrder } from '@/hooks/queries/useMarketplaceOrders';
import { marketplaceOrdersApi, type MarketplaceOrderStatus } from '@/api/marketplaceOrders.api';
import { useAuthStore } from '@/store/auth.store';
import { formatDateTimeMedium, formatMoney } from '@/lib/formatters';
import { DOMAIN_STATUS_LABELS } from '@marketplat/contracts';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';

const statusLabels: Record<MarketplaceOrderStatus, string> = DOMAIN_STATUS_LABELS.order;
const transitions: Partial<Record<MarketplaceOrderStatus, MarketplaceOrderStatus>> = {
  PENDING: 'CONFIRMED', CONFIRMED: 'PROCESSING', PROCESSING: 'SHIPPED', SHIPPED: 'DELIVERED',
};
const money = (value: number | string, currency: string) => formatMoney(value, currency);

export function MarketplaceOrderDetailPage() {
  const params = useParams<{ id: string }>();
  const id = typeof params.id === 'string' ? params.id : '';
  const router = useRouter();
  const queryClient = useQueryClient();
  const user = useAuthStore((state) => state.user);
  const [sellerNote, setSellerNote] = useState('');
  const { data: order, isLoading, isError, refetch } = useMarketplaceOrder(id);
  const update = useMutation({
    mutationFn: (status: MarketplaceOrderStatus) => marketplaceOrdersApi.updateStatus(id, status, sellerNote.trim() || undefined),
    onSuccess: async (response) => {
      if (!response.data.success || !response.data.data) throw new Error(response.data.message || 'تعذر تحديث الطلب.');
      queryClient.setQueryData(['marketplace-order', id], response.data.data);
      await queryClient.invalidateQueries({ queryKey: ['marketplace-orders'] });
      toast.success('تم تحديث حالة الطلب');
      setSellerNote('');
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : 'تعذر تحديث الطلب.'),
  });

  const isSeller = Boolean(order && user?.id === order.sellerId);
  const isBuyer = Boolean(order && user?.id === order.buyerId);
  const nextStatus = useMemo(() => order && isSeller ? transitions[order.status] : undefined, [order, isSeller]);
  const canCancel = Boolean(order && (order.status === 'PENDING' || (isSeller && order.status === 'CONFIRMED')) && (isSeller || isBuyer));

  if (isLoading) return <div className="mx-auto max-w-3xl loading-pulse space-y-3"><div className="h-24 rounded-2xl bg-muted/50" /><div className="h-64 rounded-2xl bg-muted/50" /></div>;
  if (isError || !order) return <EmptyState tone="warning" icon={<Package />} title="تعذر تحميل تفاصيل الطلب" description="قد تكون فقدت صلاحية الوصول أو حدث خطأ في الاتصال." action={<><Button variant="outline" onClick={() => void refetch()}>إعادة المحاولة</Button><Button variant="ghost" onClick={() => router.push('/orders')}>العودة إلى الطلبات</Button></>} />;

  return (
    <div className="mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3"><Button variant="ghost" onClick={() => router.push('/orders')}><ArrowRight className="ms-2 h-4 w-4" />كل الطلبات</Button><span className="rounded-full bg-muted px-3 py-1.5 text-sm font-bold">{statusLabels[order.status]}</span></div>
      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div><p className="text-xs text-muted-foreground">رقم الطلب</p><h1 className="mt-1 break-all text-xl font-extrabold">#{order.id}</h1><p className="mt-2 text-sm text-muted-foreground">أنشئ في {formatDateTimeMedium(order.createdAt)}</p></div><div className="text-start"><p className="text-xs text-muted-foreground">الإجمالي النهائي</p><p className="mt-1 text-2xl font-extrabold tabular-nums">{money(order.total, order.currency)}</p><p className="text-xs text-muted-foreground">التوصيل مجاني حاليًا</p></div></div></section>
      <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"><h2 className="font-bold">المنتجات</h2><div className="mt-3 divide-y">{order.items.map((item) => <div key={item.id} className="flex items-center justify-between gap-3 py-3"><div className="min-w-0"><p className="font-semibold">{item.productName}</p><p className="mt-1 text-xs text-muted-foreground">الكمية: {item.quantity} × {money(item.unitPrice, order.currency)}</p></div><p className="shrink-0 font-bold tabular-nums">{money(item.lineTotal, order.currency)}</p></div>)}</div><div className="mt-3 space-y-2 border-t pt-3 text-sm"><div className="flex justify-between"><span className="text-muted-foreground">المجموع الفرعي</span><span>{money(order.subtotal, order.currency)}</span></div><div className="flex justify-between"><span className="text-muted-foreground">التوصيل</span><span>مجاني</span></div><div className="flex justify-between font-extrabold"><span>الإجمالي</span><span>{money(order.total, order.currency)}</span></div></div></section>
      <section className="grid gap-3 sm:grid-cols-2"><div className="rounded-2xl border bg-card p-4"><h2 className="font-bold">بيانات الاستلام</h2><p className="mt-3 text-sm">{order.recipientName}</p><p className="mt-1 text-sm text-muted-foreground">{order.recipientPhone}</p><p className="mt-1 text-sm text-muted-foreground">{order.shippingCity} — {order.shippingAddress}</p>{order.buyerNote ? <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">ملاحظة المشتري: {order.buyerNote}</p> : null}</div><div className="rounded-2xl border bg-card p-4"><h2 className="font-bold">{isSeller ? 'بيانات المشتري' : 'بيانات المتجر'}</h2><p className="mt-3 text-sm font-semibold">{isSeller ? order.buyer?.name : order.store?.name}</p><p className="mt-1 text-sm text-muted-foreground">{isSeller ? order.buyer?.phone : order.store?.phone}</p>{order.sellerNote ? <p className="mt-3 rounded-lg bg-muted/60 p-3 text-sm">ملاحظة المتجر: {order.sellerNote}</p> : null}</div></section>
      {isSeller && nextStatus ? <section className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5"><h2 className="font-bold">إجراءات المتجر</h2><label className="mt-3 block text-sm font-medium" htmlFor="seller-order-note">ملاحظة للمشتري (اختياري)</label><textarea id="seller-order-note" value={sellerNote} onChange={(event) => setSellerNote(event.target.value)} maxLength={1000} rows={2} className="mt-1 w-full rounded-xl border bg-background p-3 text-sm" placeholder="أضف توضيحًا حول حالة الطلب" /><Button className="mt-3" disabled={update.isPending} onClick={() => update.mutate(nextStatus)}><CheckCircle2 className="ms-2 h-4 w-4" />{nextStatus === 'CONFIRMED' ? 'تأكيد الطلب' : nextStatus === 'PROCESSING' ? 'بدء التجهيز' : nextStatus === 'SHIPPED' ? 'تسجيل الشحن' : 'تسجيل التسليم'}</Button></section> : null}
      {canCancel ? <section className="rounded-2xl border border-destructive/30 bg-card p-4"><h2 className="font-bold">إلغاء الطلب</h2><p className="mt-1 text-sm text-muted-foreground">سيتم تحديث حالة الطلب وإعادة الكميات المحجوزة إلى المخزون عند إتمام الإلغاء.</p><Button variant="destructive" className="mt-3" disabled={update.isPending} onClick={() => { if (window.confirm('هل تريد إلغاء هذا الطلب؟')) update.mutate('CANCELLED'); }}><XCircle className="ms-2 h-4 w-4" />إلغاء الطلب</Button></section> : null}
      {order.status === 'SHIPPED' ? <div className="rounded-xl border bg-muted/40 p-3 text-sm"><Truck className="me-2 inline h-4 w-4" />تم تسجيل شحن الطلب، وبانتظار تأكيد التسليم.</div> : null}
      <div className="text-center"><IntentPrefetchLink href="/orders" className="text-sm font-semibold text-primary underline-offset-4 hover:underline">العودة إلى قائمة الطلبات</IntentPrefetchLink></div>
    </div>
  );
}
