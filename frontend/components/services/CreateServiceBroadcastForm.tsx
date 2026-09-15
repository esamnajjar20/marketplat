'use client';

import { useState, type FormEvent } from 'react';
import { Loader2 } from 'lucide-react';
import { useServiceCategories } from '@/hooks/queries/useServiceCategories';
import { useCreateServiceBroadcast } from '@/hooks/mutations/useServiceBroadcastMutations';
import { useFormDraft, readFormDraft } from '@/hooks/useFormDraft';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

// PHASE-OFFLINE-DRAFTS (FEAT-CREATE-BROADCAST-01): نفس نمط AdForm/
// ProductForm/ServiceListingForm بالضبط — طلب خدمة لا يحمل صورًا، فمسودة
// localStorage البسيطة (useFormDraft) تكفي بدون الحاجة لآلية
// offlineAdDrafts (IndexedDB + مركز المزامنة) المخصصة لحالات الصور.
type BroadcastDraftValues = {
  categoryId: string;
  title: string;
  description: string;
  city: string;
};

export function CreateServiceBroadcastForm() {
  // FEAT-CREATE-BROADCAST-01: كانت useQuery مضمّنة هنا مباشرة بمفتاح
  // ['service-categories'] يدويًا — نفس المفتاح حرفيًا اللي
  // useServiceCategories() (lib/queryKeys.ts) يستخدمه، فكانت تشارك نفس
  // كاش React Query صدفةً لكن بدون staleTime المخصّص لتصنيفات "تتغيّر
  // نادرًا" (CACHE_TTL.categories) ولا التوحيد مع بقية النماذج
  // (ServiceListingForm يستخدم نفس الـ hook). التبديل هنا تناسق فقط —
  // لا يغيّر مصدر البيانات نفسه.
  const { data: categories, isLoading: catsLoading } = useServiceCategories();
  // FEAT-CREATE-BROADCAST-01: مسودة محلية — نفس نمط AdForm/ProductForm/
  // ServiceListingForm بالضبط: قراءة draft مرة واحدة داخل lazy
  // useState initializer (لا useEffect ولا setState أثناء الـ render،
  // ولا قراءة localStorage بكل render) فلا تظهر الحقول فارغة للحظة ثم
  // تُملأ بعد التركيب. لا يوجد وضع "تعديل" هنا (سوق الطلبات لا يدعم
  // تعديل الطلب بعد نشره)، فلا استثناء مطلوب كالذي في النماذج الأخرى
  // (mode === 'create').
  const [categoryId, setCategoryId] = useState(
    () => readFormDraft<BroadcastDraftValues>('service-broadcast:create')?.categoryId ?? '',
  );
  const [title, setTitle] = useState(
    () => readFormDraft<BroadcastDraftValues>('service-broadcast:create')?.title ?? '',
  );
  const [description, setDescription] = useState(
    () => readFormDraft<BroadcastDraftValues>('service-broadcast:create')?.description ?? '',
  );
  const [city, setCity] = useState(
    () => readFormDraft<BroadcastDraftValues>('service-broadcast:create')?.city ?? '',
  );
  const create = useCreateServiceBroadcast();

  const { clearDraft, lastSavedAt } = useFormDraft<BroadcastDraftValues>(
    'service-broadcast:create',
    { categoryId, title, description, city },
  );

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId || title.trim().length < 5 || description.trim().length < 10) return;
    create.mutate(
      {
        categoryId,
        title: title.trim(),
        description: description.trim(),
        city: city.trim() || undefined,
      },
      // FEAT-CREATE-BROADCAST-01: نفس نمط AdForm — onSuccess هنا (لا
      // onSettled) عمدًا: طلب أوفلاين يبقى بالطابور (queued، ليس نجاحًا
      // بعد) عبر sw.js's handleMutation (انظر تعليقه — يقبل أي POST
      // لطلب API بغض النظر عن المسار، لا حاجة لأي تعديل هناك)، فمسح
      // المسودة قبل نجاح فعلي يخسّرها المستخدم بلا داع.
      { onSuccess: () => clearDraft() },
    );
  }

  if (catsLoading) {
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
          المدينة (اختياري)
        </label>
        <Input
          id="bc-city"
          value={city}
          onChange={(e) => setCity(e.target.value)}
          placeholder="مثال: غزة، خان يونس…"
          maxLength={100}
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
