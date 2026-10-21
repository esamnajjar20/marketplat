'use client';

/**
 * إدارة المخزون — جدول منتجات المتجر مع تعديل كمية سريع.
 * يعتمد على GET /products/me + PATCH /products/:id/stock
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Package, AlertTriangle, History, Boxes, TrendingDown, CircleAlert } from 'lucide-react';
import { useMyProducts } from '@/hooks/queries/useProducts';
import { useAdjustProductStock } from '@/hooks/mutations/useAdjustProductStock';
import { useStockHistory, useStockSummary } from '@/hooks/queries/useStockInventory';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { Badge } from '@/components/shared/ui/Badge';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { Pagination } from '@/components/shared/ui/Pagination';
import { ROUTES } from '@/lib/constants';
import type { ProductAvailability } from '@/types/product.types';
import { cn } from '@/lib/utils';

const AVAIL_LABELS: Record<ProductAvailability, string> = {
  IN_STOCK: 'متوفر',
  LIMITED: 'منخفض',
  OUT_OF_STOCK: 'نافد',
};

type StockFilter = 'all' | 'low' | 'out';

function stockBadgeVariant(a: ProductAvailability): 'success' | 'warning' | 'destructive' | 'secondary' {
  if (a === 'IN_STOCK') return 'success';
  if (a === 'LIMITED') return 'warning';
  if (a === 'OUT_OF_STOCK') return 'destructive';
  return 'secondary';
}

function StockRow({
  id,
  name,
  stockQuantity,
  availability,
}: {
  id: string;
  name: string;
  stockQuantity: number | null;
  availability: ProductAvailability;
}) {
  const adjust = useAdjustProductStock();
  const [value, setValue] = useState(
    stockQuantity != null ? String(stockQuantity) : ''
  );
  const [editing, setEditing] = useState(false);

  function save() {
    const trimmed = value.trim();
    const qty = trimmed === '' ? null : Number(trimmed);
    if (trimmed !== '' && (!Number.isFinite(qty) || qty! < 0 || !Number.isInteger(qty))) {
      return;
    }
    adjust.mutate(
      { id, stockQuantity: qty, reason: 'MANUAL_ADJUSTMENT' },
      { onSuccess: () => setEditing(false) }
    );
  }

  function bump(delta: number) {
    const current = stockQuantity ?? 0;
    const next = Math.max(0, current + delta);
    setValue(String(next));
    adjust.mutate({ id, stockQuantity: next, reason: delta > 0 ? 'RESTOCK' : 'SALE_OR_CORRECTION' });
  }

  const qtyLabel = stockQuantity != null ? stockQuantity : 0;

  return (
    <div className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
          <Package className="h-5 w-5" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Link
              href={ROUTES.myStoreProductEdit(id)}
              className="line-clamp-1 text-[13px] font-bold hover:underline sm:text-sm"
            >
              {name}
            </Link>
            <Badge variant={stockBadgeVariant(availability)} className="shrink-0">
              {AVAIL_LABELS[availability]}
            </Badge>
          </div>
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex items-center overflow-hidden rounded-[10px] border border-border/80 bg-background">
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center text-base font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"
                disabled={adjust.isPending}
                onClick={() => bump(-1)}
                aria-label="إنقاص"
              >
                −
              </button>
              {editing ? (
                <Input
                  type="number"
                  min={0}
                  className="h-8 w-14 rounded-none border-0 border-x border-border/80 text-center text-sm font-extrabold tabular-nums shadow-none focus-visible:ring-0"
                  value={value}
                  onChange={(e) => setValue(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') save();
                    if (e.key === 'Escape') {
                      setValue(stockQuantity != null ? String(stockQuantity) : '');
                      setEditing(false);
                    }
                  }}
                />
              ) : (
                <span className="inline-flex h-8 min-w-9 items-center justify-center border-x border-border/80 px-2 text-sm font-extrabold tabular-nums">
                  {qtyLabel}
                </span>
              )}
              <button
                type="button"
                className="flex h-8 w-8 items-center justify-center text-base font-bold text-muted-foreground hover:bg-muted disabled:opacity-50"
                disabled={adjust.isPending}
                onClick={() => bump(1)}
                aria-label="زيادة"
              >
                +
              </button>
            </div>
            <div className="flex items-center gap-1.5">
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-9 rounded-xl px-3 font-bold"
                onClick={() => setEditing(true)}
              >
                تعديل
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-9 rounded-xl px-3 font-bold"
                onClick={save}
                disabled={adjust.isPending || !editing}
              >
                حفظ
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export function MyStoreInventory() {
  const router = useRouter();
  const sp = useSearchParams();
  // SW-INVENTORY-a hand-edited URL like ?page=abc produced
  // NaN, which the products hook serialised onto the wire — same class
  // of bug across the seven admin tables. Clamp to a positive
  // integer with a fallback of 1.
  const rawPage = Number(sp.get('page') ?? 1);
  const page = Number.isInteger(rawPage) && rawPage > 0 ? rawPage : 1;
  const filter = (sp.get('stock') as StockFilter) || 'all';
  const searchQ = sp.get('q') ?? '';
  const [searchInput, setSearchInput] = useState(searchQ);

  // Map UI filter → API availability when possible
  const availability: ProductAvailability | undefined =
    filter === 'out' ? 'OUT_OF_STOCK' : filter === 'low' ? 'LIMITED' : undefined;

  const { data, isLoading, isError, refetch } = useMyProducts({
    page,
    limit: 20,
    availability,
    search: searchQ || undefined,
    // ACTIVE only for operational inventory
    status: 'ACTIVE',
  });

  const items = useMemo(() => data?.items ?? [], [data?.items]);
  const totalPages = data?.meta?.totalPages ?? 1;

  // SW-INVENTORY-FILTER-01: reverted the extra client-side filter.
  //
  // Previous version, when filter='low', kept only rows where
  // availability === 'LIMITED' OR stockQuantity <= 5. That second
  // clause narrowed the definition beyond what the backend considers
  // 'limited' — and worse, it applied AFTER pagination. The API could
  // return 20 LIMITED products and this view would show 3 of them
  // while totalPages still said "5 pages" — the user saw 3 items and
  // 5 page buttons, then landed on "empty" pages 2-5.
  //
  // The backend's own productAvaility mapping is the single source of
  // truth for what "منخفض" means. If that definition ever needs to
  // change, it changes in products.service.ts and this view reflects
  // it automatically. Client-side disambiguation against the same
  // field is precisely the kind of drift the codebase already avoids
  // elsewhere (T760 family, AGENTS.md).
  const rows = items;
  const { data: summary } = useStockSummary();
  const { data: historyData } = useStockHistory({ page: 1, limit: 8 });

  function pushParams(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(sp.toString());
    mutator(params);
    params.delete('page');
    // SW-INVENTORY-replace, not push. Filters and search are
    // refinements of the same view — pushing made Back require N presses
    // to actually leave the page after setting three filters, matching
    // the same reasoning already applied to SearchFilters.
    router.replace(`${ROUTES.myStore}?${params.toString()}`);
  }

  function setFilter(next: StockFilter) {
    pushParams((params) => {
      if (next === 'all') params.delete('stock');
      else params.set('stock', next);
    });
  }

  function submitSearch(e: React.FormEvent) {
    e.preventDefault();
    pushParams((params) => {
      const q = searchInput.trim();
      if (q) params.set('q', q);
      else params.delete('q');
    });
  }

  if (isLoading) {
    return (
      <div className="flex justify-center py-16">
        <LoadingSpinner />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex flex-col items-center gap-3 py-12 text-center">
        <AlertTriangle className="h-10 w-10 text-muted-foreground" />
        <p className="text-destructive">تعذّر تحميل المخزون</p>
        <button type="button" className="text-sm text-primary hover:underline" onClick={() => refetch()}>
          إعادة المحاولة
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4 lg:space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-extrabold">إدارة المخزون</h1>
          <p className="text-xs text-muted-foreground sm:text-sm">
            عدّل الكميات بسرعة دون فتح صفحة المنتج كاملة
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={ROUTES.myStoreProducts}>كل المنتجات</Link>
        </Button>
      </div>

      {summary && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-5">
          {([
            ['إجمالي المنتجات', summary.totalProducts, Package],
            ['الوحدات المتاحة', summary.totalUnits, Boxes],
            ['متوفر', summary.inStock, Package],
            ['منخفض', summary.limited, TrendingDown],
            ['نافد', summary.outOfStock, CircleAlert],
          ] as const).map(([label, value, Icon]) => (
            <div key={String(label)} className="rounded-2xl border border-border/70 bg-card p-3 shadow-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs text-muted-foreground">{String(label)}</span>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="mt-1 text-xl font-bold tabular-nums">{String(value)}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {(
          [
            ['all', 'الكل'],
            ['low', 'منخفض'],
            ['out', 'نافد'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-full border px-3 py-1 text-sm transition-colors',
              filter === key
                ? 'border-primary bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {label}
          </button>
        ))}
        <form onSubmit={submitSearch} className="ms-auto flex gap-2">
          <Input
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="بحث بالاسم…"
            className="h-9 w-44"
          />
          <Button type="submit" size="sm" variant="secondary">
            بحث
          </Button>
        </form>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          icon={<Package className="h-10 w-10" />}
          title="لا منتجات في هذا التصفية"
          description="أضف منتجات من صفحة المنتجات أو غيّر الفلتر."
          action={
            <Button asChild size="sm">
              <Link href={ROUTES.myStoreProductCreate}>إضافة منتج</Link>
            </Button>
          }
        />
      ) : (
        <div className="space-y-2.5">
          {rows.map((p) => (
            <StockRow
              key={p.id}
              id={p.id}
              name={p.name}
              stockQuantity={p.stockQuantity ?? null}
              availability={p.availability}
            />
          ))}
        </div>
      )}

      {(historyData?.items?.length ?? 0) > 0 && (
        <section className="rounded-xl border">
          <div className="flex items-center gap-2 border-b px-3 py-3">
            <History className="h-4 w-4 text-muted-foreground" />
            <div>
              <h2 className="text-sm font-semibold">آخر حركات المخزون</h2>
              <p className="text-xs text-muted-foreground">سجل تدقيقي لآخر التعديلات على الكميات</p>
            </div>
          </div>
          <div className="divide-y">
            {(historyData?.items ?? []).map((movement) => (
              <div key={movement.id} className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5 text-sm">
                <div className="min-w-0">
                  <p className="truncate font-medium">{movement.product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {movement.reason === 'INITIAL_STOCK' ? 'رصيد افتتاحي' : 'تعديل يدوي'}
                    {' · '}
                    {new Date(movement.createdAt).toLocaleString('ar', { timeZone: 'Asia/Gaza' })}
                  </p>
                </div>
                <div className="text-end tabular-nums">
                  <p className={cn(
                    'font-semibold',
                    movement.delta != null && movement.delta > 0 && 'text-success',
                    movement.delta != null && movement.delta < 0 && 'text-destructive',
                  )}>
                    {movement.delta == null ? 'تعيين' : movement.delta > 0 ? `+${movement.delta}` : movement.delta}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {movement.previousQuantity ?? '—'} ← {movement.newQuantity ?? '—'}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      {totalPages > 1 && (
        <Pagination
          totalPages={totalPages}
          currentPage={page}
          baseUrl={ROUTES.myStore}
          searchParams={Object.fromEntries(sp.entries())}
        />
      )}
    </div>
  );
}
