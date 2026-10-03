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
import type { AdminStoreType, CreateAdminStoreTypePayload } from '@/types/admin.types';

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
};

function toForm(type: AdminStoreType): FormState {
  return {
    slug: type.slug,
    nameAr: type.nameAr,
    icon: type.icon,
    labels: type.labels,
    freeProductLimit: type.freeProductLimit,
    sortOrder: type.sortOrder,
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
    setForm({ ...EMPTY_FORM, labels: { ...EMPTY_LABELS } });
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
      },
    }, { onSuccess: cancel });
  }

  const setLabel = (key: keyof FormState['labels'], value: string) =>
    setForm((prev) => ({ ...prev, labels: { ...prev.labels, [key]: value } }));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          إدارة الأنواع والمصطلحات وحدود المنتجات المجانية. لا يمكن حذف النوع.
        </p>
        <Button size="sm" className="gap-1.5" onClick={startCreate}>
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
                  <div className="grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                    <span>الجمع: {type.labels.products}</span>
                    <span>المفرد: {type.labels.product}</span>
                    <span>زر الإضافة: {type.labels.addProduct}</span>
                    <span>الفئات: {type.labels.categories}</span>
                  </div>
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
  onSave,
  onCancel,
}: {
  form: FormState;
  isNew?: boolean;
  pending: boolean;
  setForm: React.Dispatch<React.SetStateAction<FormState>>;
  setLabel: (key: keyof FormState['labels'], value: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Field label="Slug" value={form.slug} disabled={!isNew} onChange={(value) => setForm((p) => ({ ...p, slug: value }))} />
        <Field label="الاسم العربي" value={form.nameAr} onChange={(value) => setForm((p) => ({ ...p, nameAr: value }))} />
        <Field label="الأيقونة" value={form.icon} onChange={(value) => setForm((p) => ({ ...p, icon: value }))} />
        <Field label="الحد المجاني" type="number" value={form.freeProductLimit == null ? '' : String(form.freeProductLimit)} onChange={(value) => setForm((p) => ({ ...p, freeProductLimit: value === '' ? null : Number(value) }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="ترتيب العرض" type="number" value={String(form.sortOrder ?? 0)} onChange={(value) => setForm((p) => ({ ...p, sortOrder: Number(value) }))} />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="الجمع" value={form.labels.products} onChange={(v) => setLabel('products', v)} />
        <Field label="المفرد" value={form.labels.product} onChange={(v) => setLabel('product', v)} />
        <Field label="زر الإضافة" value={form.labels.addProduct} onChange={(v) => setLabel('addProduct', v)} />
        <Field label="الفئات" value={form.labels.categories} onChange={(v) => setLabel('categories', v)} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" disabled={pending} onClick={onSave} className="gap-1.5">
          <Save className="h-3.5 w-3.5" /> حفظ
        </Button>
        <Button size="sm" variant="outline" disabled={pending} onClick={onCancel} className="gap-1.5">
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
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  type?: string;
  disabled?: boolean;
}) {
  return (
    <label className="space-y-1.5 text-xs font-medium">
      <span>{label}</span>
      <Input type={type} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
    </label>
  );
}
