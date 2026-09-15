'use client';

import { useState, useEffect, type FormEvent } from 'react';
import { useSearchParams } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { useCreateServiceBroadcast } from '@/hooks/mutations/useServiceBroadcastMutations';
import { useFormDraft, readFormDraft } from '@/hooks/useFormDraft';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { getAdDraft } from '@/lib/offlineAdDrafts';
import {
  setActiveOfflineDraftId,
  clearActiveOfflineDraftId,
} from '@/lib/offlineDraftResume';

// PHASE-OFFLINE-DRAFTS: localStorage (useFormDraft) أثناء الكتابة +
// IndexedDB (offlineAdDrafts, kind: service-broadcast) عند فشل الشبكة
// حتى تظهر المسودة بمركز المزامنة ويمكن استئنافها عبر ?draftId=.
type BroadcastDraftValues = {
  categoryId: string;
  title: string;
  description: string;
  city: string;
};

export function CreateServiceBroadcastForm() {
  const searchParams = useSearchParams();
  const offlineDraftId = searchParams.get('draftId');

  const { data: categories, isLoading: catsLoading } = useServiceCategories();

  const [categoryId, setCategoryId] = useState(
    () =>
      offlineDraftId
        ? ''
        : (readFormDraft<BroadcastDraftValues>('service-broadcast:create')?.categoryId ?? ''),
  );
  const [title, setTitle] = useState(
    () =>
      offlineDraftId
        ? ''
        : (readFormDraft<BroadcastDraftValues>('service-broadcast:create')?.title ?? ''),
  );
  const [description, setDescription] = useState(
    () =>
      offlineDraftId
        ? ''
        : (readFormDraft<BroadcastDraftValues>('service-broadcast:create')?.description ?? ''),
  );
  const [city, setCity] = useState(
    () =>
      offlineDraftId
        ? ''
        : (readFormDraft<BroadcastDraftValues>('service-broadcast:create')?.city ?? ''),
  );
  const [draftLoading, setDraftLoading] = useState(Boolean(offlineDraftId));
  const create = useCreateServiceBroadcast();

  const { clearDraft, lastSavedAt } = useFormDraft<BroadcastDraftValues>(
    'service-broadcast:create',
    { categoryId, title, description, city },
  );

  // استئناف مسودة IndexedDB من مركز المزامنة (?draftId=)
  useEffect(() => {
    if (!offlineDraftId) {
      clearActiveOfflineDraftId();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await getAdDraft(offlineDraftId);
        if (cancelled || !d || d.kind !== 'service-broadcast') return;
        const p = d.payload;
        setCategoryId(String(p.categoryId ?? ''));
        setTitle(String(p.title ?? ''));
        setDescription(String(p.description ?? ''));
        setCity(String(p.city ?? ''));
        setActiveOfflineDraftId(d.id);
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offlineDraftId]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId || title.trim().length < 5 || description.trim().length < 10 || !city.trim()) return;
    create.mutate(
      {
        categoryId,
        title: title.trim(),
        description: description.trim(),
        city: city.trim(),
      },
      // onSuccess فقط: طلب أوفلاين يبقى بالطابور (ليس نجاحًا بعد) عبر
      // sw.js handleMutation — مسح المسودة قبل نجاح فعلي يخسّرها.
      { onSuccess: () => clearDraft() },
    );
  }

  if (catsLoading || draftLoading) {
    return (
      <div className="flex justify-center py-12">
        <LoadingSpinner />
      </div>
    );
  }

  const list = categories ?? [];
  const canSubmit =
    Boolean(categoryId) &&
    title.trim().length >= 5 &&
    description.trim().length >= 10 &&
    Boolean(city.trim()) &&
    !create.isPending;

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div className="space-y-1.5">
        <label htmlFor="bc-cat" className="text-sm font-medium">
          فئة الخدمة
        </label>
        <select
          id="bc-cat"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
        >
          <option value="">اختر الفئة…</option>
          {list.map((c) => (
            <option key={c.id} value={c.id}>
              {c.nameAr || c.name}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="bc-title" className="text-sm font-medium">
          عنوان الطلب
        </label>
        <Input
          id="bc-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="مثال: تحتاج سباك لإصلاح تسرّب"
          maxLength={150}
          required
        />
        <p className="text-[11px] text-muted-foreground">5 أحرف على الأقل</p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="bc-desc" className="text-sm font-medium">
          التفاصيل
        </label>
        <textarea
          id="bc-desc"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="صف المطلوب بوضوح: الموقع التقريبي، الوقت المناسب، وأي تفاصيل تساعد على تسعير دقيق"
          maxLength={1000}
          rows={5}
          required
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm min-h-[120px]"
        />
        <p className="text-[11px] text-muted-foreground">
          {description.length}/1000 · 10 أحرف على الأقل
        </p>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="bc-city" className="text-sm font-medium">
          المدينة <span className="text-destructive">*</span>
        </label>
        <Input
          id="bc-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="مثال: غزة، خان يونس…"
          maxLength={100}
          required
        />
      </div>

      {/* FEAT-CREATE-BROADCAST-01: نفس مؤشر "مسودة محفوظة" الموجود بالضبط
          بـ AdForm/ProductForm/ServiceListingForm — تناسق بصري ووظيفي. */}
      {lastSavedAt && (
        <p
          className="flex items-center gap-1.5 rounded-md border border-primary/20 bg-primary/5 px-3 py-1.5 text-xs text-primary"
          role="status"
          aria-live="polite"
        >
          <span className="inline-block h-1.5 w-1.5 rounded-full bg-primary" aria-hidden />
          مسودة محفوظة تلقائياً — يمكنك إغلاق الصفحة والعودة لاحقاً
        </p>
      )}

      <Button type="submit" disabled={!canSubmit} className="w-full gap-2">
        {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        نشر الطلب في السوق
      </Button>
    </form>
  );
}
