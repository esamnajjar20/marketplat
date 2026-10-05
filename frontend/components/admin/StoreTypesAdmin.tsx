'use client';

import { useState } from 'react';
import { Pencil, Plus, Power, Save, X } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { Badge } from '@/components/shared/ui/Badge';
import {
  useAdminCreateStoreType,
  useAdminUpdateStoreTypeDefinition,
  useAdminUpdateStoreTypeStatus,
} from '@/hooks/mutations/useAdminMutations';
import { useAdminStoreTypes } from '@/hooks/queries/useAdmin';
import { StoreTypeFieldsAdmin } from '@/components/admin/StoreTypeFieldsAdmin';
import type { AdminStoreType, CreateAdminStoreTypePayload } from '@/types/admin.types';
import { DEFAULT_STORE_TYPE_PRESENTATION, type StoreTypePresentation } from '@/types/store.types';

const EMPTY_LABELS = {
  products: 'المنتجات',
  product: 'منتج',
  addProduct: 'أضف منتجًا',
  categories: 'التصنيفات',
};

type FormState = CreateAdminStoreTypePayload;

const EMPTY_FORM: FormState = {
  slug: '',
  nameAr: '',
  icon: 'Store',
  labels: EMPTY_LABELS,
  freeProductLimit: 20,
  sortOrder: 0,
  presentation: DEFAULT_STORE_TYPE_PRESENTATION,
};

function toForm(type: AdminStoreType): FormState {
  return {
    slug: type.slug,
    nameAr: type.nameAr,
    icon: type.icon,
    labels: type.labels,
    freeProductLimit: type.freeProductLimit,
    sortOrder: type.sortOrder,
    presentation: type.presentation,
  };
}

export function StoreTypesAdmin() {
  const { data: types = [], isLoading } = useAdminStoreTypes();
  const create = useAdminCreateStoreType();
  const update = useAdminUpdateStoreTypeDefinition();
  const updateStatus = useAdminUpdateStoreTypeStatus();
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function startCreate() {
    setEditing('new');
    setForm({ ...EMPTY_FORM, labels: { ...EMPTY_LABELS }, presentation: structuredClone(DEFAULT_STORE_TYPE_PRESENTATION) });
  }

  function startEdit(type: AdminStoreType) {
    setEditing(type.id);
    setForm(toForm(type));
  }

  function cancel() {
    setEditing(null);
  }

  function submit() {
    if (!form.nameAr.trim() || !form.icon.trim()) return;
    if (editing === 'new') {
      create.mutate({
        ...form,
        slug: form.slug.trim(),
        nameAr: form.nameAr.trim(),
        icon: form.icon.trim(),
        freeProductLimit: form.freeProductLimit === null ? null : Number(form.freeProductLimit),
        sortOrder: Number(form.sortOrder ?? 0),
        presentation: form.presentation,
      }, { onSuccess: cancel });
      return;
    }

    if (!editing) return;
    update.mutate({
      id: editing,
      payload: {
        nameAr: form.nameAr.trim(),
        icon: form.icon.trim(),
        labels: form.labels,
        freeProductLimit: form.freeProductLimit === null ? null : Number(form.freeProductLimit),
        sortOrder: Number(form.sortOrder ?? 0),
        presentation: form.presentation,
      },
    }, { onSuccess: cancel });
  }

  const setPresentation = (scope: 'card' | 'page', key: keyof StoreTypePresentation['card'], value: string) =>
    setForm((prev) => ({ ...prev, presentation: { ...prev.presentation!, [scope]: { ...prev.presentation![scope], [key]: value } } }));

  const setLabel = (key: keyof FormState['labels'], value: string) =>
    setForm((prev) => ({ ...prev, labels: { ...prev.labels, [key]: value } }));

  return (
    <div dir="rtl" className="space-y-4 text-right">
      <div className="flex flex-col items-stretch gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-muted-foreground">
          إدارة الأنواع والمصطلحات وحدود المنتجات المجانية. لا يمكن حذف النوع.
        </p>
        <Button size="sm" className="w-full gap-1.5 sm:w-auto" onClick={startCreate}>
          <Plus className="h-4 w-4" /> نوع جديد
        </Button>
      </div>

      {editing === 'new' && (
        <Editor
          form={form}
          isNew
          pending={create.isPending}
          setForm={setForm}
          setLabel={setLabel}
          setPresentation={setPresentation}
          onSave={submit}
          onCancel={cancel}
        />
      )}

      {isLoading ? (
        <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">جارٍ التحميل…</div>
      ) : (
        <div className="grid gap-3">
          {types.map((type) => (
            <div key={type.id} className="rounded-xl border bg-card p-4">
              {editing === type.id ? (
                <Editor
                  form={form}
                  pending={update.isPending}
                  setForm={setForm}
                  setLabel={setLabel}
                  setPresentation={setPresentation}
                  onSave={submit}
                  onCancel={cancel}
                />
              ) : (
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold">{type.nameAr}</span>
                    <Badge variant="outline">{type.slug}</Badge>
                    <Badge variant={type.isActive ? 'success' : 'outline'}>
                      {type.isActive ? 'نشط' : 'غير نشط'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">أيقونة: {type.icon}</span>
                    <span className="text-xs text-muted-foreground">
                      الحد المجاني: {type.freeProductLimit ?? 'بدون حد'}
                    </span>
                  </div>
                  <div className="grid gap-1 text-xs text-muted-foreground md:grid-cols-2">
                    <span>الجمع: {type.labels.products}</span>
                    <span>المفرد: {type.labels.product}</span>
                    <span>زر الإضافة: {type.labels.addProduct}</span>
                    <span>الفئات: {type.labels.categories}</span>
                  </div>
                  <StoreTypeFieldsAdmin storeTypeId={type.id} />
                  <div className="flex flex-wrap gap-2 border-t pt-3">
                    <Button size="sm" variant="outline" className="gap-1.5" onClick={() => startEdit(type)}>
                      <Pencil className="h-3.5 w-3.5" /> تعديل
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="gap-1.5"
                      disabled={updateStatus.isPending}
                      onClick={() => updateStatus.mutate({ id: type.id, isActive: !type.isActive })}
                    >
                      <Power className="h-3.5 w-3.5" />
                      {type.isActive ? 'تعطيل' : 'تفعيل'}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Editor({
  form,
  isNew = false,
  pending,
  setForm,
  setLabel,
  setPresentation,
  onSave,
  onCancel,
}: {
  form: FormState;
  isNew?: boolean;
  pending: boolean;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  setLabel: (key: keyof FormState['labels'], value: string) => void;
  setPresentation: (scope: 'card' | 'page', key: keyof StoreTypePresentation['card'], value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div dir="rtl" className="space-y-3 rounded-xl border border-primary/25 bg-primary/5 p-4 text-right">
      <div className="grid min-w-0 gap-3 md:grid-cols-2 lg:grid-cols-4">
        <Field label="Slug" dir="ltr" value={form.slug} disabled={!isNew} onChange={(value) => setForm((p) => ({ ...p, slug: value }))} />
        <Field label="الاسم العربي" value={form.nameAr} onChange={(value) => setForm((p) => ({ ...p, nameAr: value }))} />
        <Field label="الأيقونة" dir="ltr" value={form.icon} onChange={(value) => setForm((p) => ({ ...p, icon: value }))} />
        <div className="space-y-1">
          <Field label="الحد المجاني" type="number" value={form.freeProductLimit == null ? '' : String(form.freeProductLimit)} onChange={(value) => setForm((p) => ({ ...p, freeProductLimit: value === '' ? null : Math.max(0, Number(value)) }))} />
          <p className="text-[11px] text-muted-foreground">اتركه فارغًا لبدون حد. يطبّق على منتجات هذا النوع فقط.</p>
        </div>
      </div>
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <Field label="ترتيب العرض" type="number" value={String(form.sortOrder ?? 0)} onChange={(value) => setForm((p) => ({ ...p, sortOrder: Number(value) }))} />
      </div>
      <div className="grid min-w-0 gap-3 md:grid-cols-2">
        <Field label="الجمع" value={form.labels.products} onChange={(v) => setLabel('products', v)} />
        <Field label="المفرد" value={form.labels.product} onChange={(v) => setLabel('product', v)} />
        <Field label="زر الإضافة" value={form.labels.addProduct} onChange={(v) => setLabel('addProduct', v)} />
        <Field label="الفئات" value={form.labels.categories} onChange={(v) => setLabel('categories', v)} />
      </div>
      <div className="space-y-2 rounded-lg border bg-background/70 p-3">
        <p className="text-sm font-semibold">أسماء البطاقة والصفحة</p>
        <div className="grid min-w-0 gap-3 md:grid-cols-2">
          <Field label="عنوان البطاقة" value={form.presentation?.card.title ?? ''} onChange={(v) => setPresentation('card', 'title', v)} />
          <Field label="وصف البطاقة" value={form.presentation?.card.subtitle ?? ''} onChange={(v) => setPresentation('card', 'subtitle', v)} />
          <Field label="اسم المنتجات في البطاقة" value={form.presentation?.card.products ?? ''} onChange={(v) => setPresentation('card', 'products', v)} />
          <Field label="اسم التفاصيل في البطاقة" value={form.presentation?.card.details ?? ''} onChange={(v) => setPresentation('card', 'details', v)} />
          <Field label="اسم التواصل في البطاقة" value={form.presentation?.card.contact ?? ''} onChange={(v) => setPresentation('card', 'contact', v)} />
          <Field label="اسم الموقع في البطاقة" value={form.presentation?.card.location ?? ''} onChange={(v) => setPresentation('card', 'location', v)} />
          <Field label="عنوان الصفحة" value={form.presentation?.page.title ?? ''} onChange={(v) => setPresentation('page', 'title', v)} />
          <Field label="وصف الصفحة" value={form.presentation?.page.subtitle ?? ''} onChange={(v) => setPresentation('page', 'subtitle', v)} />
          <Field label="اسم المنتجات في الصفحة" value={form.presentation?.page.products ?? ''} onChange={(v) => setPresentation('page', 'products', v)} />
          <Field label="اسم العروض" value={form.presentation?.page.offers ?? ''} onChange={(v) => setPresentation('page', 'offers', v)} />
          <Field label="اسم المجموعات" value={form.presentation?.page.collections ?? ''} onChange={(v) => setPresentation('page', 'collections', v)} />
          <Field label="اسم الإعلانات" value={form.presentation?.page.ads ?? ''} onChange={(v) => setPresentation('page', 'ads', v)} />
          <Field label="اسم التقييمات" value={form.presentation?.page.reviews ?? ''} onChange={(v) => setPresentation('page', 'reviews', v)} />
          <Field label="اسم تبويب الصفحة" value={form.presentation?.page.about ?? ''} onChange={(v) => setPresentation('page', 'about', v)} />
          <Field label="عنوان التفاصيل" value={form.presentation?.page.details ?? ''} onChange={(v) => setPresentation('page', 'details', v)} />
          <Field label="عنوان التواصل" value={form.presentation?.page.contact ?? ''} onChange={(v) => setPresentation('page', 'contact', v)} />
          <Field label="عنوان الموقع" value={form.presentation?.page.location ?? ''} onChange={(v) => setPresentation('page', 'location', v)} />
        </div>
      </div>
      <div className="grid grid-cols-1 gap-2 sm:flex sm:flex-row">
        <Button size="sm" disabled={pending} className="w-full gap-1.5 sm:w-auto" onClick={onSave}>
          <Save className="h-3.5 w-3.5" /> حفظ
        </Button>
        <Button size="sm" variant="outline" disabled={pending} className="w-full gap-1.5 sm:w-auto" onClick={onCancel}>
          <X className="h-3.5 w-3.5" /> إلغاء
        </Button>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  type = 'text',
  disabled = false,
  dir,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
  dir?: "rtl" | "ltr";
}) {
  return (
    <label dir="rtl" className="space-y-1.5 text-xs font-medium">
      <span className="block break-words leading-5">{label}</span>
      <Input dir={dir} type={type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
