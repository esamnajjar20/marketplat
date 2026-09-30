'use client';

/**
 * إدارة المخزون — جدول منتجات المتجر مع تعديل كمية سريع.
 * يعتمد على GET /products/me + PATCH /products/:id/stock
 */

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Package, AlertTriangle, Pencil } from 'lucide-react';
import { useMyProducts } from '@/hooks/queries/useProducts';
import { useAdjustProductStock } from '@/hooks/mutations/useAdjustProductStock';
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
  status,
}: {
  id: string;
  name: string;
  stockQuantity: number | null;
  availability: ProductAvailability;
  status: string;
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
      { id, stockQuantity: qty },
      { onSuccess: () => setEditing(false) }
    );
  }

  function bump(delta: number) {
    const current = stockQuantity ?? 0;
    const next = Math.max(0, current + delta);
    setValue(String(next));
    adjust.mutate({ id, stockQuantity: next });
  }

  return (
    <tr className="border-b last:border-0">
      <td className="px-3 py-3">
        <div className="min-w-0">
          <Link
            href={ROUTES.myStoreProductEdit(id)}
            className="font-medium hover:underline line-clamp-1"
          >
            {name}
          </Link>
          <p className="text-xs text-muted-foreground">{status}</p>
        </div>
      </td>
      <td className="px-3 py-3">
        <Badge variant={stockBadgeVariant(availability)}>
          {AVAIL_LABELS[availability]}
        </Badge>
      </td>
      <td className="px-3 py-3">
        {editing ? (
          <div className="flex items-center gap-1">
            <Input
              type="number"
              min={0}
              className="h-9 w-24"
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
            <Button size="sm" onClick={save} disabled={adjust.isPending}>
              حفظ
            </Button>
          </div>
        ) : (
          <span className="tabular-nums text-sm">
            {stockQuantity != null ? stockQuantity : '—'}
          </span>
        )}
      </td>
      <td className="px-3 py-3">
        <div className="flex flex-wrap items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            disabled={adjust.isPending}
            onClick={() => bump(-1)}
            aria-label="إنقاص"
          >
            −
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 w-8 p-0"
            disabled={adjust.isPending}
            onClick={() => bump(1)}
            aria-label="زيادة"
          >
            +
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-8 gap-1 px-2"
            onClick={() => setEditing(true)}
          >
            <Pencil className="h-3.5 w-3.5" />
            تعديل
          </Button>
        </div>
      </td>
    </tr>
  );
}

export function MyStoreInventory() {
  const router = useRouter();
  const sp = useSearchParams();
  // SW-INVENTORY-FIXES-01: a hand-edited URL like ?page=abc produced
  // NaN, which the products hook serialised onto the wire — same class
  // of bug fixed across the seven admin tables. Clamp to a positive
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

  function pushParams(mutator: (params: URLSearchParams) => void) {
    const params = new URLSearchParams(sp.toString());
    mutator(params);
    params.delete('page');
    // SW-INVENTORY-FIXES-01: replace, not push. Filters and search are
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
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">إدارة المخزون</h1>
          <p className="text-sm text-muted-foreground">
            عدّل الكميات بسرعة دون فتح صفحة المنتج كاملة
          </p>
        </div>
        <Button asChild size="sm" variant="outline">
          <Link href={ROUTES.myStoreProducts}>كل المنتجات</Link>
        </Button>
      </div>

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
        <div className="overflow-x-auto rounded-xl border">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="bg-muted/50 text-muted-foreground">
              <tr>
                <th className="px-3 py-2 text-start font-medium">المنتج</th>
                <th className="px-3 py-2 text-start font-medium">الحالة</th>
                <th className="px-3 py-2 text-start font-medium">الكمية</th>
                <th className="px-3 py-2 text-start font-medium">إجراءات</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((p) => (
                <StockRow
                  key={p.id}
                  id={p.id}
                  name={p.name}
                  stockQuantity={p.stockQuantity ?? null}
                  availability={p.availability}
                  status={p.status}
                />
              ))}
            </tbody>
          </table>
        </div>
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
