'use client';

import { useMemo, useState } from 'react';
import { Save, Search, Power, CircleDollarSign } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useSalesCostProducts, useSalesCostSettings } from '@/hooks/queries/useSales';
import { useUpdateProductCost, useUpdateSalesCostSettings } from '@/hooks/mutations/useSaleMutations';

export function SalesCostSection() {
  const settings = useSalesCostSettings();
  const enabled = settings.data?.enabled ?? true;
  const products = useSalesCostProducts(enabled);
  const updateSettings = useUpdateSalesCostSettings();
  const updateCost = useUpdateProductCost();
  const [search, setSearch] = useState('');
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const filtered = useMemo(() => {
    const q = search.trim().toLocaleLowerCase('ar');
    if (!q) return products.data ?? [];
    return (products.data ?? []).filter((p) => `${p.name} ${p.store.name}`.toLocaleLowerCase('ar').includes(q));
  }, [products.data, search]);

  const save = (productId: string, current: string | null) => {
    const raw = drafts[productId] ?? (current ?? '');
    if (raw.trim() === '') return updateCost.mutate({ productId, costPrice: null });
    const value = Number(raw);
    if (!Number.isFinite(value) || value < 0) return;
    updateCost.mutate({ productId, costPrice: Math.round(value * 100) / 100 });
  };

  return (
    <section className="space-y-5">
      <div className="rounded-2xl border bg-card p-4 sm:p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="mt-0.5 rounded-xl bg-primary/10 p-2 text-primary"><CircleDollarSign className="h-5 w-5" /></div>
            <div>
              <h2 className="font-bold">التكلفة الحقيقية</h2>
              <p className="mt-1 text-sm leading-6 text-muted-foreground">حدد تكلفة المنتج مرة واحدة. عند تسجيل أي بيع للمنتج، تُحفظ هذه التكلفة تلقائيًا مع البيع.</p>
            </div>
          </div>
          <label className="flex shrink-0 cursor-pointer items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={enabled} disabled={settings.isLoading || updateSettings.isPending} onChange={(e) => updateSettings.mutate(e.target.checked)} />
            <span className="hidden sm:inline">تفعيل الميزة</span>
          </label>
        </div>
      </div>

      {!enabled ? (
        <div className="rounded-2xl border border-dashed p-8 text-center">
          <Power className="mx-auto h-8 w-8 text-muted-foreground" />
          <h3 className="mt-3 font-semibold">التكلفة الحقيقية متوقفة</h3>
          <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">لن تظهر تكاليف المنتجات أو الربح في المبيعات، ولن تُنسخ تكلفة جديدة إلى المبيعات أثناء إيقاف الميزة.</p>
          <Button className="mt-4" onClick={() => updateSettings.mutate(true)} disabled={updateSettings.isPending}>تفعيل الميزة</Button>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div><h3 className="font-semibold">تكلفة المنتجات</h3><p className="text-sm text-muted-foreground">تعديل التكلفة هنا لا يغير تكلفة المبيعات السابقة.</p></div>
            <div className="relative w-full sm:w-72"><Search className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" /><Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="ابحث عن منتج أو متجر" className="pe-9" /></div>
          </div>
          {products.isLoading ? <div className="rounded-xl border p-8 text-center text-sm text-muted-foreground">جاري تحميل المنتجات…</div> : products.isError ? <div className="rounded-xl border p-8 text-center text-sm text-destructive">تعذر تحميل تكاليف المنتجات.</div> : filtered.length === 0 ? <div className="rounded-xl border border-dashed p-8 text-center text-sm text-muted-foreground">لا توجد منتجات مطابقة.</div> : <div className="overflow-hidden rounded-2xl border"><div className="divide-y">{filtered.map((product: any) => { const value = drafts[product.id] ?? (product.costPrice ?? ''); return <div key={product.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"><div className="min-w-0"><div className="truncate font-medium">{product.name}</div><div className="mt-1 text-xs text-muted-foreground">{product.store.name} · سعر البيع {Number(product.price).toFixed(2)} ₪</div></div><div className="flex items-center gap-2 sm:w-64"><Input dir="ltr" inputMode="decimal" type="number" min="0" step="0.01" value={value} onChange={(e) => setDrafts((prev) => ({ ...prev, [product.id]: e.target.value }))} placeholder="بدون تكلفة" aria-label={`تكلفة ${product.name}`} /><Button size="icon" aria-label={`حفظ تكلفة ${product.name}`} onClick={() => save(product.id, product.costPrice)} disabled={updateCost.isPending}><Save className="h-4 w-4" /></Button></div></div>; })}</div></div>}
        </>
      )}
    </section>
  );
}
