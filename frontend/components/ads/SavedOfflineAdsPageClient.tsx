'use client';

/**
 * PHASE-OFFLINE-AD-DETAIL + SAVE-ENTITY-01:
 * قائمة موحّدة لكل ما حُفظ يدوياً للعرض بدون اتصال:
 * إعلانات، منتجات، متاجر.
 *
 * التبويبات أعلى القائمة تسمح بتضييق النطاق على نوع واحد، أو عرض الكل
 * معاً. كل عنصر يعرف وجهته الصحيحة (adDetail / productDetail /
 * storeDetail) عبر ROUTES.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { WifiOff, Trash2, Search } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { EmptyState } from '@/components/shared/feedback/EmptyState';
import { SafeImage } from '@/components/shared/ui/SafeImage';
import {
  listSavedEntities,
  unsaveEntityOffline,
  type SavedEntityMeta,
  type SavedEntityType,
} from '@/lib/offlineSavedEntities';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';
import { useAuthStore, selectUser } from '@/store/auth.store';

type Tab = 'all' | SavedEntityType;

const TABS: { id: Tab; label: string }[] = [
  { id: 'all',     label: 'الكل' },
  { id: 'ad',      label: 'إعلانات' },
  { id: 'product', label: 'منتجات' },
  { id: 'store',   label: 'متاجر' },
  { id: 'seller',  label: 'بائعون' },
];

const TYPE_LABEL: Record<SavedEntityType, string> = {
  ad: 'إعلان',
  product: 'منتج',
  store: 'متجر',
  seller: 'بائع',
};

function hrefFor(e: SavedEntityMeta): string {
  switch (e.type) {
    case 'ad':      return ROUTES.adDetail(e.id);
    case 'product': return ROUTES.productDetail(e.id);
    case 'store':   return ROUTES.storeDetail(e.id);
    case 'seller':  return ROUTES.userProfile(e.id);
  }
}

export function SavedOfflineAdsPageClient() {
  const user = useAuthStore(selectUser);
  const userId = user?.id ?? null;
  const [items, setItems] = useState<SavedEntityMeta[]>([]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');

  const refresh = useCallback(() => {
    setItems(listSavedEntities(undefined, userId));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const filteredByTab = useMemo(
    () => (tab === 'all' ? items : items.filter((e) => e.type === tab)),
    [items, tab],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return filteredByTab;
    return filteredByTab.filter(
      (e) =>
        e.title.toLowerCase().includes(q) ||
        (e.city ?? '').toLowerCase().includes(q) ||
        (e.subtitle ?? '').toLowerCase().includes(q),
    );
  }, [filteredByTab, query]);

  const counts = useMemo(() => {
    const c = { all: items.length, ad: 0, product: 0, store: 0, seller: 0 };
    for (const e of items) c[e.type] += 1;
    return c;
  }, [items]);

  async function handleRemove(e: SavedEntityMeta) {
    await unsaveEntityOffline(e.type, e.id, userId);
    toast.success('أُزيل من المحفوظات');
    refresh();
  }

  if (items.length === 0) {
    return (
      <EmptyState
        icon={<WifiOff />}
        title="لا توجد عناصر محفوظة دون اتصال"
        description={'افتح أي إعلان أو منتج أو متجر واضغط "احفظ للعرض بدون نت" لتتمكن من فتحه لاحقًا حتى بدون إنترنت.'}
      />
    );
  }

  return (
    <div className="space-y-4">
      {/* Tabs — filter by entity type */}
      <div className="flex gap-2 overflow-x-auto" role="group" aria-label="تصفية حسب النوع">
        {TABS.map((t) => {
          const count = counts[t.id];
          const disabled = t.id !== 'all' && count === 0;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              disabled={disabled}
              aria-pressed={tab === t.id}
              className={`shrink-0 rounded-full border px-3 py-1 text-sm transition-colors ${
                tab === t.id
                  ? 'border-primary bg-primary text-primary-foreground shadow-xs'
                  : 'border-border text-muted-foreground hover:bg-muted'
              } ${disabled ? 'opacity-40' : ''}`}
            >
              {t.label}{' '}
              <span className="font-mono opacity-80">({count})</span>
            </button>
          );
        })}
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="بحث في المحفوظات…"
          className="h-11 ps-10"
          aria-label="بحث في المحفوظات"
        />
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={<Search />}
          title="لا نتائج"
          description="جرّب كلمة أخرى أو امسح البحث."
        />
      ) : (
        <ul className="flex flex-col gap-3" role="list">
          {filtered.map((e) => (
            <li
              key={`${e.type}:${e.id}`}
              className="flex items-center gap-3 rounded-xl border bg-card p-3 shadow-sm"
            >
              <Link
                prefetch={false}
                href={hrefFor(e)}
                className="relative h-16 w-16 shrink-0 overflow-hidden rounded-lg bg-muted"
              >
                {e.thumbnail && (
                  <SafeImage src={e.thumbnail} alt={e.title} fill className="object-cover" sizes="64px" />
                )}
              </Link>
              <Link href={hrefFor(e)} className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
                    {TYPE_LABEL[e.type]}
                  </span>
                </div>
                <p className="truncate font-semibold">{e.title}</p>
                <p className="truncate text-sm text-muted-foreground">
                  {e.subtitle ?? '—'}
                  {e.city ? ` · ${e.city}` : ''}
                </p>
              </Link>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                aria-label={`إزالة ${e.title} من المحفوظات`}
                onClick={() => void handleRemove(e)}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
