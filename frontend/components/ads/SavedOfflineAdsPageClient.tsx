'use client';

/**
 * + SAVE-ENTITY-01:
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
  checkSavedEntityCacheStatus,
  saveEntityOffline,
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
  { id: 'service', label: 'خدمات' },
  { id: 'seller',  label: 'بائعون' },
];

const TYPE_LABEL: Record<SavedEntityType, string> = {
  ad: 'إعلان',
  product: 'منتج',
  store: 'متجر',
  seller: 'بائع',
  service: 'خدمة',
};

function hrefFor(e: SavedEntityMeta): string {
  switch (e.type) {
    case 'ad':      return ROUTES.adDetail(e.id);
    case 'product': return ROUTES.productDetail(e.id);
    case 'store':   return ROUTES.storeDetail(e.id);
    case 'seller':  return ROUTES.userProfile(e.id);
    case 'service': return ROUTES.serviceDetail(e.id);
  }
}

export function SavedOfflineAdsPageClient() {
  const user = useAuthStore(selectUser);
  const userId = user?.id ?? null;
  const [items, setItems] = useState<SavedEntityMeta[]>([]);
  const [query, setQuery] = useState('');
  const [tab, setTab] = useState<Tab>('all');
  const [missingSnapshots, setMissingSnapshots] = useState<Set<string>>(() => new Set());
  const [repairingSnapshots, setRepairingSnapshots] = useState<Set<string>>(() => new Set());

  const refresh = useCallback(() => {
    setItems(listSavedEntities(undefined, userId));
  }, [userId]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Verify saved API snapshots after reload. Keep the index intact when a
  // snapshot is missing so this diagnostic cannot destroy recovery metadata.
  useEffect(() => {
    let cancelled = false;
    void Promise.all(items.map(async (item) => ({
      key: `${item.type}:${item.id}`,
      status: await checkSavedEntityCacheStatus(item),
    }))).then((results) => {
      if (cancelled) return;
      setMissingSnapshots(new Set(results.filter((r) => r.status === 'missing').map((r) => r.key)));
    });
    return () => { cancelled = true; };
  }, [items]);

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
    const c = { all: items.length, ad: 0, product: 0, store: 0, seller: 0, service: 0 };
    for (const e of items) c[e.type] += 1;
    return c;
  }, [items]);

  async function handleRepair(e: SavedEntityMeta) {
    const key = `${e.type}:${e.id}`;
    setRepairingSnapshots((current) => new Set(current).add(key));
    try {
      const ok = await saveEntityOffline(e.type, {
        id: e.id,
        title: e.title,
        subtitle: e.subtitle,
        city: e.city,
        thumbnail: e.thumbnail,
        imageUrls: e.imageUrls,
      }, userId);
      if (!ok) {
        toast.error('تعذّر استرجاع النسخة المحلية. تحقق من الاتصال ثم أعد المحاولة.');
        return;
      }
      const status = await checkSavedEntityCacheStatus(e);
      if (status === 'available') {
        setMissingSnapshots((current) => {
          const next = new Set(current);
          next.delete(key);
          return next;
        });
        toast.success('تم تحديث النسخة المحلية بنجاح');
        refresh();
      } else {
        toast.error('تمت محاولة الحفظ لكن تعذّر التحقق من النسخة المحلية.');
      }
    } finally {
      setRepairingSnapshots((current) => {
        const next = new Set(current);
        next.delete(key);
        return next;
      });
    }
  }

  async function handleRemove(e: SavedEntityMeta) {
    const ok = await unsaveEntityOffline(e.type, e.id, userId);
    if (ok) {
      toast.success('أُزيل من المحفوظات');
      refresh();
    } else {
      toast.error('تعذّرت إزالة العنصر من المحفوظات؛ لم يتغير الحفظ المحلي.');
    }
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
      <div className="flex gap-2 overflow-x-auto overscroll-x-contain" role="group" aria-label="تصفية حسب النوع">
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
              className="flex items-center gap-3 rounded-2xl border border-[#EAE3D6] bg-white p-3 shadow-[0_1px_3px_rgba(42,36,29,0.06)] dark:border-border dark:bg-card"
            >
              <Link
                prefetch={false}
                href={hrefFor(e)}
                className="relative flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[#E8F1EC] dark:bg-primary/10"
              >
                {e.thumbnail && (
                  <SafeImage src={e.thumbnail} alt={e.title} fill className="object-cover" sizes="64px" />
                )}
              </Link>
              <div className="min-w-0 flex-1">
                <Link href={hrefFor(e)} className="block min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="rounded-full bg-[#E8F1EC] px-2 py-0.5 text-[10px] font-bold text-[#1F4D33] dark:bg-primary/15 dark:text-primary">
                      {TYPE_LABEL[e.type]}
                    </span>
                  </div>
                  <p className="truncate text-sm font-extrabold text-foreground">{e.title}</p>
                  <p className="truncate text-sm text-muted-foreground">
                    {e.subtitle ?? '—'}
                    {e.city ? ` · ${e.city}` : ''}
                  </p>
                </Link>
                {missingSnapshots.has(`${e.type}:${e.id}`) && (
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <p className="text-xs font-medium text-destructive" role="status">
                      نسخة المحتوى غير موجودة محليًا؛ قد لا يفتح دون إنترنت
                    </p>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={repairingSnapshots.has(`${e.type}:${e.id}`)}
                      onClick={() => void handleRepair(e)}
                    >
                      {repairingSnapshots.has(`${e.type}:${e.id}`) ? 'جارٍ الاسترجاع…' : 'إعادة حفظ النسخة'}
                    </Button>
                  </div>
                )}
              </div>
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
