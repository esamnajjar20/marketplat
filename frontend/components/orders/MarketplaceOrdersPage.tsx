'use client';

import { useState } from 'react';
import IntentPrefetchLink from '@/components/navigation/IntentPrefetchLink';
import { Button } from '@/components/shared/ui/Button';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { FilterChipGroup } from '@/components/shared/filters/FilterChipGroup';
import { useMarketplaceOrders } from '@/hooks/queries/useMarketplaceOrders';
import { formatDateTimeMedium } from '@/lib/formatters';
import type { MarketplaceOrderStatus } from '@/api/marketplaceOrders.api';
import { ClipboardList, RefreshCw, ShoppingBag, Store } from 'lucide-react';

const statusLabels: Record<MarketplaceOrderStatus, string> = {
  PENDING: 'بانتظار التأكيد', CONFIRMED: 'تم التأكيد', PROCESSING: 'قيد التجهيز',
  SHIPPED: 'تم الشحن', DELIVERED: 'تم التسليم', CANCELLED: 'ملغي',
};
const money = (value: number | string, currency: string) => `${Number(value).toLocaleString('ar', { maximumFractionDigits: 2 })} ${currency}`;

export function MarketplaceOrdersPage() {
  const [kind, setKind] = useState<'buyer' | 'seller'>('buyer');
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, isFetching, refetch } = useMarketplaceOrders(kind, page);
  const items = data?.items ?? [];

  return (
    <div className="space-y-5">
      <div className="rounded-2xl border bg-card p-4 shadow-sm sm:p-5">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary"><ClipboardList className="h-5 w-5" /></span>
            <div><h2 className="font-bold">طلبات المنتجات</h2><p className="text-sm text-muted-foreground">تابع طلبات الشراء الواردة والصادرة، وهي منفصلة عن سجل المبيعات اليدوية.</p></div>
          </div>
          <Button variant="outline" onClick={() => void refetch()} loading={isFetching} loadingPhase="refreshing"><RefreshCw className="ms-2 h-4 w-4" />تحديث</Button>
        </div>
      </div>

      <FilterChipGroup
        label="نوع الطلبات"
        value={kind}
        options={[
          { value: 'buyer', label: 'طلباتي كمشتري', icon: <ShoppingBag className="h-4 w-4" /> },
          { value: 'seller', label: 'طلبات متجري', icon: <Store className="h-4 w-4" /> },
        ]}
        onChange={(next) => { setKind(next as 'buyer' | 'seller'); setPage(1); }}
        className="flex-wrap"
      />

      {isLoading ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{Array.from({ length: 6 }).map((_, i) => <div key={i} className="h-36 loading-pulse rounded-2xl border bg-muted/40" />)}</div>
        : isError ? <EmptyState tone="warning" icon={<RefreshCw />} title="تعذر تحميل الطلبات" description="تحقق من الاتصال ثم أعد المحاولة." action={<Button variant="outline" onClick={() => void refetch()}>إعادة المحاولة</Button>} />
          : items.length ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{items.map((order) => <IntentPrefetchLink key={order.id} href={`/orders/${encodeURIComponent(order.id)}`} prefetch={false} className="block rounded-2xl border bg-card p-4 shadow-sm transition hover:border-primary/50 hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <div className="flex items-start justify-between gap-2"><div className="min-w-0"><p className="truncate font-bold">{kind === 'seller' ? order.buyer?.name ?? 'مشتري' : order.store?.name ?? 'المتجر'}</p><p className="mt-1 text-xs text-muted-foreground">طلب #{order.id.slice(-8)}</p></div><span className="shrink-0 rounded-full bg-muted px-2.5 py-1 text-xs font-semibold">{statusLabels[order.status]}</span></div>
            <div className="mt-4 flex items-end justify-between gap-3"><div><p className="text-xs text-muted-foreground">{order.items.length} منتجات · {formatDateTimeMedium(order.createdAt)}</p><p className="mt-1 text-lg font-extrabold tabular-nums">{money(order.total, order.currency)}</p></div><span className="text-sm font-semibold text-primary">التفاصيل ←</span></div>
          </IntentPrefetchLink>)}</div>
            : <EmptyState icon={<ClipboardList />} title={kind === 'seller' ? 'لا توجد طلبات واردة' : 'لم تسجل طلبات شراء بعد'} description={kind === 'seller' ? 'ستظهر طلبات العملاء لمتجرك هنا.' : 'ستظهر طلبات المنتجات التي تشتريها من المتاجر هنا.'} />}

      {data && data.meta.totalPages > 1 ? <div className="flex items-center justify-center gap-3"><Button variant="outline" disabled={page <= 1} onClick={() => setPage((n) => n - 1)}>السابق</Button><span className="text-sm text-muted-foreground">صفحة {page} من {data.meta.totalPages}</span><Button variant="outline" disabled={page >= data.meta.totalPages} onClick={() => setPage((n) => n + 1)}>التالي</Button></div> : null}
    </div>
  );
}
