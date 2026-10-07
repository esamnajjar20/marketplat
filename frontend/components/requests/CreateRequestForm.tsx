'use client';

import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { Wrench, ShoppingBag, Home, Check, ChevronLeft, ChevronRight } from 'lucide-react';
import { useCreateRequest } from '@/hooks/mutations/useRequestMutations';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { useProductCategories } from '@/hooks/queries/useProductCategories';
import { useCategories } from '@/hooks/queries/useCategories';
import { useFormDraft, readFormDraft } from '@/hooks/useFormDraft';
import { FormDraftStatus } from '@/components/shared/forms/FormDraftStatus';
import type { RequestType } from '@/types/request.types';
import { REQUEST_TYPE_LABEL, formatRequestBudget } from '@/lib/requestStatus';
import { Button } from '@/components/shared/ui/Button';
import { CITIES } from '@/lib/constants';
import { ImageUpload } from '@/components/shared/forms/ImageUpload';
import { getAdDraft } from '@/lib/offlineAdDrafts';
import {
  setActiveOfflineDraftId,
  clearActiveOfflineDraftId,
} from '@/lib/offlineDraftResume';
import { cn } from '@/lib/utils';

const TYPES: RequestType[] = ['SERVICE', 'PRODUCT', 'RENTAL'];

const TYPE_META: Record<
  RequestType,
  { label: string; hint: string; icon: typeof Wrench }
> = {
  SERVICE: {
    label: 'خدمة',
    hint: 'صيانة، توصيل، تعليم، تصميم…',
    icon: Wrench,
  },
  PRODUCT: {
    label: 'منتج',
    hint: 'شيء تبحث عن شرائه',
    icon: ShoppingBag,
  },
  RENTAL: {
    label: 'إيجار',
    hint: 'شقة، محل، معدات…',
    icon: Home,
  },
};

const STEPS = [
  { id: 1, title: 'النوع والفئة' },
  { id: 2, title: 'التفاصيل' },
  { id: 3, title: 'الميزانية والمكان' },
  { id: 4, title: 'مراجعة ونشر' },
] as const;

type DraftValues = {
  type: RequestType;
  categoryId: string;
  title: string;
  description: string;
  city: string;
  budgetMin: string;
  budgetMax: string;
  /** آخر خطوة وصل إليها المستخدم — تُستعاد عند العودة للمسودة */
  step?: number;
  expiresInDays?: string;
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

/**
 * استعادة خطوة الـ Stepper من المسودة.
 * يفضّل `step` المحفوظ صراحةً؛ وإلا يُستنتج من اكتمال الحقول.
 */
function inferStepFromDraft(d: {
  categoryId?: string;
  title?: string;
  description?: string;
  city?: string;
  budgetMin?: string;
  budgetMax?: string;
  step?: number;
}): number {
  if (typeof d.step === 'number' && d.step >= 1 && d.step <= 4) {
    return Math.floor(d.step);
  }
  const hasCat = Boolean(d.categoryId?.trim());
  const hasDetails =
    (d.title?.trim().length ?? 0) >= 5 && (d.description?.trim().length ?? 0) >= 10;
  // الحقول في الخطوة 3 اختيارية — إن اكتملت التفاصيل نضع المستخدم على خطوة 3
  // (لا نفرض المراجعة تلقائياً إلا إن كان step محفوظاً = 4).
  if (hasCat && hasDetails) return 3;
  if (hasCat) return 2;
  return 1;
}


function StepIndicator({ current }: { current: number }) {
  return (
    <ol className="flex items-center gap-1 sm:gap-2" aria-label="خطوات إنشاء الطلب">
      {STEPS.map((s, i) => {
        const done = current > s.id;
        const active = current === s.id;
        return (
          <li key={s.id} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
            <div
              className={cn(
                'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold transition-colors',
                done && 'bg-primary text-primary-foreground',
                active && 'bg-primary text-primary-foreground ring-2 ring-primary/30',
                !done && !active && 'bg-muted text-muted-foreground',
              )}
              aria-current={active ? 'step' : undefined}
            >
              {done ? <Check className="h-4 w-4" aria-hidden /> : s.id}
            </div>
            <span
              className={cn(
                'hidden truncate text-xs sm:inline',
                active ? 'font-semibold text-foreground' : 'text-muted-foreground',
              )}
            >
              {s.title}
            </span>
            {i < STEPS.length - 1 && (
              <div
                className={cn(
                  'mx-0.5 hidden h-px flex-1 sm:block',
                  done ? 'bg-primary/50' : 'bg-border',
                )}
                aria-hidden
              />
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * نموذج إنشاء طلب متعدد الخطوات — يحافظ على المسودة أوفلاين.
 */
export function CreateRequestForm() {
  const create = useCreateRequest();
  const searchParams = useSearchParams();
  const offlineDraftId = searchParams.get('draftId');

  const seed = !offlineDraftId ? readFormDraft<DraftValues>('open-request:create') : null;

  const [step, setStep] = useState(() =>
    seed
      ? inferStepFromDraft({
          categoryId: seed.categoryId,
          title: seed.title,
          description: seed.description,
          city: seed.city,
          budgetMin: seed.budgetMin,
          budgetMax: seed.budgetMax,
          step: seed.step,
        })
      : 1,
  );
  const [type, setType] = useState<RequestType>(seed?.type ?? 'SERVICE');
  const [expiresInDays, setExpiresInDays] = useState<string>(seed?.expiresInDays ?? '7');
  const [categoryId, setCategoryId] = useState(seed?.categoryId ?? '');
  const [title, setTitle] = useState(seed?.title ?? '');
  const [description, setDescription] = useState(seed?.description ?? '');
  const [city, setCity] = useState(seed?.city ?? '');
  const [budgetMax, setBudgetMax] = useState(seed?.budgetMax ?? '');
  const [budgetMin, setBudgetMin] = useState(seed?.budgetMin ?? '');
  const [files, setFiles] = useState<File[]>([]);
  const [draftLoading, setDraftLoading] = useState(Boolean(offlineDraftId));
  const [stepError, setStepError] = useState<string | null>(null);

  const { clearDraft, lastSavedAt, isSaving } = useFormDraft<DraftValues>(
    'open-request:create',
    { type, categoryId, title, description, city, budgetMin, budgetMax, step, expiresInDays },
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
        if (p.expiresInDays != null) setExpiresInDays(String(p.expiresInDays));
        setStep(
          inferStepFromDraft({
            categoryId: String(p.categoryId ?? ''),
            title: String(p.title ?? ''),
            description: String(p.description ?? ''),
            city: String(p.city ?? ''),
            budgetMin: p.budgetMin != null ? String(p.budgetMin) : '',
            budgetMax: p.budgetMax != null ? String(p.budgetMax) : '',
            step: typeof p.step === 'number' ? p.step : undefined,
          }),
        );
        setActiveOfflineDraftId(d.id);
      } catch (err) {
        console.warn('[requests/new] draft restore failed:', err);
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

  const selectedCategoryLabel =
    categoryOptions.find((c) => c.id === categoryId)?.label ?? '';

  function onTypeChange(next: RequestType) {
    setType(next);
    setCategoryId('');
  }

  function validateStep(s: number): string | null {
    if (s === 1) {
      if (!categoryId.trim()) return 'اختر الفئة للمتابعة.';
      return null;
    }
    if (s === 2) {
      if (title.trim().length < 5) return 'العنوان يجب أن يكون 5 أحرف على الأقل.';
      if (description.trim().length < 10) return 'التفاصيل يجب أن تكون 10 أحرف على الأقل.';
      return null;
    }
    return null;
  }

  function goNext() {
    const err = validateStep(step);
    if (err) {
      setStepError(err);
      return;
    }
    setStepError(null);
    setStep((x) => Math.min(4, x + 1));
  }

  function goBack() {
    setStepError(null);
    setStep((x) => Math.max(1, x - 1));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    const err1 = validateStep(1);
    const err2 = validateStep(2);
    if (err1 || err2) {
      setStepError(err1 || err2);
      if (err1) setStep(1);
      else setStep(2);
      return;
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
        expiresInDays: Number(expiresInDays) || 7,
        files: files.length > 0 ? files : undefined,
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

  const budgetPreview = formatRequestBudget(
    budgetMin || null,
    budgetMax || null,
  );

  return (
    <form
      onSubmit={onSubmit}
      className="flex flex-col gap-5 rounded-xl border border-border/80 bg-card p-4 shadow-xs sm:p-5"
      dir="rtl"
      noValidate
    >
      <StepIndicator current={step} />

      <FormDraftStatus savedAt={lastSavedAt} saving={isSaving} />

      {stepError && (
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {stepError}
        </p>
      )}

      {/* Step 1: Type + Category */}
      {step === 1 && (
        <div className="space-y-4">
          <div className="space-y-2">
            <p className="text-sm font-medium">ما نوع طلبك؟</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              {TYPES.map((t) => {
                const meta = TYPE_META[t];
                const Icon = meta.icon;
                const active = type === t;
                return (
                  <button
                    key={t}
                    type="button"
                    onClick={() => onTypeChange(t)}
                    className={cn(
                      'flex flex-col items-start gap-1.5 rounded-xl border p-3 text-start transition-[border-color,background-color,box-shadow,transform] duration-200',
                      'min-h-[5.5rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      active
                        ? 'border-primary bg-primary/10 shadow-sm ring-1 ring-primary/30'
                        : 'border-border/80 bg-background hover:border-primary/40 hover:bg-muted/30',
                    )}
                  >
                    <Icon
                      className={cn('h-5 w-5', active ? 'text-primary' : 'text-muted-foreground')}
                      aria-hidden
                    />
                    <span className="text-sm font-semibold">{meta.label}</span>
                    <span className="text-2xs leading-snug text-muted-foreground sm:text-xs">
                      {meta.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="req-cat" className="text-sm font-medium">
              الفئة <span className="text-destructive">*</span>
            </label>
            <select
              id="req-cat"
              className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base sm:h-10 sm:text-sm"
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
        </div>
      )}

      {/* Step 2: Details */}
      {step === 2 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="req-title" className="text-sm font-medium">
              العنوان <span className="text-destructive">*</span>
            </label>
            <input
              id="req-title"
              className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base sm:h-10 sm:text-sm"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              minLength={5}
              maxLength={150}
              required
              placeholder="مثال: أبحث عن فني تكييف في غزة"
            />
            <p className="text-2xs text-muted-foreground">
              {title.trim().length}/150 — عنوان واضح = عروض أفضل
            </p>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="req-desc" className="text-sm font-medium">
              التفاصيل <span className="text-destructive">*</span>
            </label>
            <textarea
              id="req-desc"
              className="min-h-[140px] w-full rounded-lg border border-input bg-background px-3 py-2 text-sm leading-relaxed"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minLength={10}
              maxLength={1000}
              required
              placeholder="صف احتياجك: المواصفات، التوقيت، أي شروط مهمة…"
            />
            <p className="text-2xs text-muted-foreground">
              {description.trim().length}/1000
            </p>
          </div>

          <div className="space-y-1.5">
            <p className="text-sm font-medium">صور (اختياري، حتى 5)</p>
            <ImageUpload value={files} onChange={setFiles} maxFiles={5} />
          </div>
        </div>
      )}

      {/* Step 3: Budget + location + expiry */}
      {step === 3 && (
        <div className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="req-city" className="text-sm font-medium">
              المدينة (اختياري)
            </label>
            <select
              id="req-city"
              className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base sm:h-10 sm:text-sm"
              value={city}
              onChange={(e) => setCity(e.target.value)}
            >
              <option value="">كل المدن / غير محدد</option>
              {CITIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
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
                min="0"
                inputMode="decimal"
                className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base sm:h-10 sm:text-sm"
                value={budgetMin}
                onChange={(e) => setBudgetMin(e.target.value)}
                placeholder="0"
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
                min="0"
                inputMode="decimal"
                className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base sm:h-10 sm:text-sm"
                value={budgetMax}
                onChange={(e) => setBudgetMax(e.target.value)}
                placeholder="0"
              />
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            اترك الميزانية فارغة إن كانت مفتوحة للتفاوض.
          </p>

          <div className="space-y-1.5">
            <label htmlFor="req-exp" className="text-sm font-medium">
              مدة ظهور الطلب
            </label>
            <select
              id="req-exp"
              className="flex h-11 w-full rounded-lg border border-input bg-background px-3 py-2 text-base sm:h-10 sm:text-sm"
              value={expiresInDays}
              onChange={(e) => setExpiresInDays(e.target.value)}
            >
              <option value="7">7 أيام</option>
              <option value="14">14 يومًا</option>
              <option value="30">30 يومًا</option>
              <option value="60">60 يومًا</option>
            </select>
          </div>
        </div>
      )}

      {/* Step 4: Review */}
      {step === 4 && (
        <div className="space-y-3">
          <p className="text-sm font-medium">راجع طلبك قبل النشر</p>
          <dl className="space-y-2.5 rounded-xl border border-border/60 bg-muted/20 p-3 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">النوع</dt>
              <dd className="font-medium">{REQUEST_TYPE_LABEL[type]}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">الفئة</dt>
              <dd className="text-end font-medium">{selectedCategoryLabel || '—'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">العنوان</dt>
              <dd className="max-w-[60%] text-end font-medium">{title.trim() || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">التفاصيل</dt>
              <dd className="mt-1 whitespace-pre-wrap leading-relaxed text-foreground/90">
                {description.trim() || '—'}
              </dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">المدينة</dt>
              <dd className="font-medium">{city || 'غير محددة'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">الميزانية</dt>
              <dd className="font-medium tabular-nums">{budgetPreview ?? 'مفتوحة'}</dd>
            </div>
            <div className="flex justify-between gap-3">
              <dt className="text-muted-foreground">المدة</dt>
              <dd className="font-medium">{expiresInDays} يومًا</dd>
            </div>
            {files.length > 0 && (
              <div className="flex justify-between gap-3">
                <dt className="text-muted-foreground">صور</dt>
                <dd className="font-medium">{files.length}</dd>
              </div>
            )}
          </dl>
          <p className="text-xs leading-relaxed text-muted-foreground">
            بعد النشر سيظهر طلبك في سوق الطلبات ويمكن للبائعين ومقدّمي الخدمة تقديم عروض.
          </p>
        </div>
      )}

      {/* Nav buttons */}
      <div className="flex flex-wrap items-center gap-2 border-t border-border/50 pt-4">
        {step > 1 && (
          <Button type="button" variant="outline" className="min-h-11 gap-1" onClick={goBack}>
            <ChevronRight className="h-4 w-4" aria-hidden />
            السابق
          </Button>
        )}
        <div className="flex-1" />
        {step < 4 ? (
          <Button type="button" className="min-h-11 min-w-[7rem] gap-1" onClick={goNext}>
            التالي
            <ChevronLeft className="h-4 w-4" aria-hidden />
          </Button>
        ) : (
          <Button
            type="submit"
            className="min-h-11 min-w-[8rem]"
            disabled={create.isPending || !categoryId || title.trim().length < 5}
          >
            {create.isPending ? 'جاري النشر…' : 'نشر الطلب'}
          </Button>
        )}
      </div>
    </form>
  );
}
