'use client';

import { FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useCreateRequest } from '@/hooks/mutations/useRequestMutations';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import { useCategories } from '@/hooks/queries/useCategories';
import { useFormDraft, readFormDraft } from '@/hooks/useFormDraft';
import type { RequestType } from '@/types/request.types';
import { REQUEST_TYPE_LABEL } from '@/lib/requestStatus';
import { Button } from '@/components/shared/ui/Button';
import { ImageUpload } from '@/components/shared/forms/ImageUpload';
import { mediaApi } from '@/api/media.api';
import { getAdDraft } from '@/lib/offlineAdDrafts';
import {
  setActiveOfflineDraftId,
  clearActiveOfflineDraftId,
} from '@/lib/offlineDraftResume';
import { toast } from 'sonner';

const TYPES: RequestType[] = ['SERVICE', 'PRODUCT', 'RENTAL'];

type DraftValues = {
  type: RequestType;
  categoryId: string;
  title: string;
  description: string;
  city: string;
  budgetMin: string;
  budgetMax: string;
};

type CatNode = { id: string; nameAr?: string; name?: string; children?: CatNode[] };

function flattenCats(nodes: CatNode[] | undefined, prefix = ''): { id: string; label: string }[] {
  if (!nodes?.length) return [];
  const out: { id: string; label: string }[] = [];
  for (const n of nodes) {
    out.push({ id: n.id, label: `${prefix}${n.nameAr || n.name || n.id}` });
    if (n.children?.length) out.push(...flattenCats(n.children, `${prefix}— `));
  }
  return out;
}

export function CreateRequestForm() {
  const create = useCreateRequest();
  const searchParams = useSearchParams();
  const offlineDraftId = searchParams.get('draftId');

  const seed = !offlineDraftId ? readFormDraft<DraftValues>('open-request:create') : null;

  const [type, setType] = useState<RequestType>(seed?.type ?? 'SERVICE');
  const [categoryId, setCategoryId] = useState(seed?.categoryId ?? '');
  const [title, setTitle] = useState(seed?.title ?? '');
  const [description, setDescription] = useState(seed?.description ?? '');
  const [city, setCity] = useState(seed?.city ?? '');
  const [budgetMax, setBudgetMax] = useState(seed?.budgetMax ?? '');
  const [budgetMin, setBudgetMin] = useState(seed?.budgetMin ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [draftLoading, setDraftLoading] = useState(Boolean(offlineDraftId));

  const { clearDraft, lastSavedAt } = useFormDraft<DraftValues>(
    'open-request:create',
    { type, categoryId, title, description, city, budgetMin, budgetMax },
    { enabled: !offlineDraftId },
  );

  useEffect(() => {
    if (!offlineDraftId) {
      clearActiveOfflineDraftId();
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const d = await getAdDraft(offlineDraftId);
        if (cancelled || !d || d.kind !== 'open-request') return;
        const p = d.payload;
        const t = p.type;
        if (t === 'SERVICE' || t === 'PRODUCT' || t === 'RENTAL') setType(t);
        setCategoryId(String(p.categoryId ?? ''));
        setTitle(String(p.title ?? ''));
        setDescription(String(p.description ?? ''));
        setCity(String(p.city ?? ''));
        setBudgetMin(p.budgetMin != null ? String(p.budgetMin) : '');
        setBudgetMax(p.budgetMax != null ? String(p.budgetMax) : '');
        setActiveOfflineDraftId(d.id);
      } finally {
        if (!cancelled) setDraftLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [offlineDraftId]);

  const serviceCats = useServiceCategories();
  const productCats = useProductCategories();
  const adCats = useCategories();

  const categoryOptions = useMemo(() => {
    const raw =
      type === 'SERVICE' ? serviceCats.data : type === 'PRODUCT' ? productCats.data : adCats.data;
    return flattenCats(raw as CatNode[] | undefined);
  }, [type, serviceCats.data, productCats.data, adCats.data]);

  const catsLoading =
    type === 'SERVICE'
      ? serviceCats.isLoading
      : type === 'PRODUCT'
        ? productCats.isLoading
        : adCats.isLoading;

  function onTypeChange(next: RequestType) {
    setType(next);
    setCategoryId('');
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId.trim() || title.trim().length < 5 || description.trim().length < 10) return;

    let attachedImages: string[] | undefined;
    if (files.length > 0) {
      try {
        setUploadProgress(0);
        const res = await mediaApi.uploadImages(files);
        attachedImages = (res.data.data ?? []).map((x) => x.url);
        setUploadProgress(100);
      } catch {
        toast.error('تعذّر رفع الصور');
        setUploadProgress(null);
        return;
      } finally {
        setUploadProgress(null);
      }
    }

    create.mutate(
      {
        type,
        categoryId: categoryId.trim(),
        title: title.trim(),
        description: description.trim(),
        city: city.trim() || undefined,
        budgetMin: budgetMin ? Number(budgetMin) : undefined,
        budgetMax: budgetMax ? Number(budgetMax) : undefined,
        attachedImages,
      },
      {
        onSuccess: () => {
          clearDraft();
          setFiles([]);
        },
      },
    );
  }

  if (draftLoading) {
    return <p className="text-center text-muted-foreground">جاري استعادة المسودة…</p>;
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-lg flex-col gap-4" dir="rtl" noValidate>
      {lastSavedAt && (
        <p className="text-xs text-muted-foreground" role="status">
          مسودة محفوظة تلقائيًا
        </p>
      )}

      <div className="space-y-1.5">
        <label htmlFor="req-type" className="text-sm font-medium">
          نوع الطلب
        </label>
        <select
          id="req-type"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={type}
          onChange={(e) => onTypeChange(e.target.value as RequestType)}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {REQUEST_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="req-cat" className="text-sm font-medium">
          الفئة
        </label>
        <select
          id="req-cat"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          required
          disabled={catsLoading}
        >
          <option value="">{catsLoading ? 'جاري تحميل الفئات…' : 'اختر الفئة…'}</option>
          {categoryOptions.map((c) => (
            <option key={c.id} value={c.id}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div className="space-y-1.5">
        <label htmlFor="req-title" className="text-sm font-medium">
          العنوان
        </label>
        <input
          id="req-title"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={5}
          maxLength={150}
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="req-desc" className="text-sm font-medium">
          التفاصيل
        </label>
        <textarea
          id="req-desc"
          className="min-h-[120px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          minLength={10}
          maxLength={1000}
          required
        />
      </div>

      <div className="space-y-1.5">
        <label htmlFor="req-city" className="text-sm font-medium">
          المدينة (اختياري)
        </label>
        <input
          id="req-city"
          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <label htmlFor="req-bmin" className="text-sm font-medium">
            ميزانية من
          </label>
          <input
            id="req-bmin"
            type="number"
            step="0.01"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={budgetMin}
            onChange={(e) => setBudgetMin(e.target.value)}
          />
        </div>
        <div className="space-y-1.5">
          <label htmlFor="req-bmax" className="text-sm font-medium">
            ميزانية إلى
          </label>
          <input
            id="req-bmax"
            type="number"
            step="0.01"
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1.5">
        <p className="text-sm font-medium">صور (اختياري، حتى 5)</p>
        <ImageUpload value={files} onChange={setFiles} maxFiles={5} uploadProgress={uploadProgress} />
      </div>

      <Button
        type="submit"
        disabled={create.isPending || uploadProgress !== null || !categoryId || title.trim().length < 5}
      >
        {create.isPending || uploadProgress !== null ? 'جاري النشر…' : 'نشر الطلب'}
      </Button>
    </form>
  );
}
