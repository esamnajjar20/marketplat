'use client';

import { useState } from 'react';
import { Pencil, Plus, Power, Save } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { Badge } from '@/components/shared/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { useAdminStoreTypeFields } from '@/hooks/queries/useAdmin';
import { useAdminCreateStoreTypeField, useAdminUpdateStoreTypeField } from '@/hooks/mutations/useAdminMutations';
import type { StoreFieldScope, StoreFieldType, StoreTypeField } from '@/types/store.types';

export function StoreTypeFieldsAdmin({ storeTypeId }: { storeTypeId: string }) {
  const { data: fields = [] } = useAdminStoreTypeFields(storeTypeId);
  const create = useAdminCreateStoreTypeField();
  const update = useAdminUpdateStoreTypeField();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const EMPTY_FORM = { key: '', scope: 'STORE' as StoreFieldScope, labelAr: '', cardLabelAr: '', pageLabelAr: '', showOnCard: false, showOnPage: true, type: 'TEXT' as StoreFieldType, required: false, options: '', sortOrder: 0 };
  const [form, setForm] = useState(EMPTY_FORM);
  const storeFieldsCount = fields.filter((field) => (field.scope ?? 'STORE') === 'STORE').length;
  const productFieldsCount = fields.filter((field) => field.scope === 'PRODUCT').length;

  function startEdit(field: StoreTypeField) {
    setEditingId(field.id);
    setForm({ key: field.key, scope: field.scope ?? 'STORE', labelAr: field.labelAr, cardLabelAr: field.cardLabelAr ?? '', pageLabelAr: field.pageLabelAr ?? field.labelAr, showOnCard: field.showOnCard ?? false, showOnPage: field.showOnPage ?? true, type: field.type, required: field.required, options: (field.options ?? []).map((o) => `${o.value}|${o.labelAr}`).join('\n'), sortOrder: field.sortOrder });
  }

  function save() {
    if (!form.key.trim() || !form.labelAr.trim()) return;
    const options = form.type === 'SELECT'
      ? form.options.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
        const [value = '', ...labelParts] = line.split('|');
        const labelAr = labelParts.join('|').trim() || value.trim();
        return { value: value.trim().toLowerCase().replace(/\s+/g, '_'), labelAr };
      })
      : undefined;
    const payload = { scope: form.scope, labelAr: form.labelAr.trim(), cardLabelAr: form.cardLabelAr.trim() || null, pageLabelAr: form.pageLabelAr.trim() || form.labelAr.trim(), showOnCard: form.showOnCard, showOnPage: form.showOnPage, type: form.type, required: form.required, options: form.type === 'SELECT' ? options : null, sortOrder: Number(form.sortOrder) };
    if (editingId) {
      update.mutate({ storeTypeId, fieldId: editingId, payload }, {
        onSuccess: () => { setEditingId(null); setForm({ ...EMPTY_FORM }); },
      });
      return;
    }
    create.mutate({ storeTypeId, payload: { key: form.key.trim(), ...payload } }, {
      onSuccess: () => { setOpen(false); setForm({ ...EMPTY_FORM }); },
    });
  }

  return (
    <div dir="rtl" className="mt-3 space-y-2 border-t pt-3 text-right">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <span className="text-xs font-semibold">الحقول الديناميكية</span>
          <div className="mt-1 flex flex-wrap gap-1.5 text-[11px] text-muted-foreground">
            <span className="rounded-full bg-muted px-2 py-0.5">المتجر {storeFieldsCount}/20</span>
            <span className="rounded-full bg-muted px-2 py-0.5">المنتج {productFieldsCount}/20</span>
          </div>
        </div>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => { setEditingId(null); setOpen((v) => !v); }} disabled={storeFieldsCount >= 20 && productFieldsCount >= 20}><Plus className="h-3.5 w-3.5" /> حقل</Button>
      </div>
      {(open || editingId) && (
        <div className="grid gap-2 rounded-lg bg-muted/40 p-3 md:grid-cols-2">
          <Input dir="ltr" placeholder="المفتاح: prep_time" value={form.key} disabled={Boolean(editingId)} onChange={(e) => setForm({ ...form, key: e.target.value })} />
          <Select value={form.scope} disabled={Boolean(editingId)} onValueChange={(v) => setForm({ ...form, scope: v as StoreFieldScope })}>
            <SelectTrigger><SelectValue placeholder="مكان الاستخدام" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="STORE">معلومة المتجر</SelectItem>
              <SelectItem value="PRODUCT">معلومة المنتج</SelectItem>
            </SelectContent>
          </Select>
          <Input dir="rtl" placeholder="الاسم الأساسي" value={form.labelAr} onChange={(e) => setForm({ ...form, labelAr: e.target.value })} />
          <Input dir="rtl" placeholder="اسم الحقل في البطاقة" value={form.cardLabelAr} onChange={(e) => setForm({ ...form, cardLabelAr: e.target.value })} />
          <Input dir="rtl" placeholder="اسم الحقل في الصفحة" value={form.pageLabelAr} onChange={(e) => setForm({ ...form, pageLabelAr: e.target.value })} />
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as StoreFieldType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TEXT">نص</SelectItem><SelectItem value="NUMBER">رقم</SelectItem><SelectItem value="BOOLEAN">نعم/لا</SelectItem><SelectItem value="SELECT">اختيار</SelectItem>
            </SelectContent>
          </Select>
          {form.type === 'SELECT' && (
            <div className="space-y-1.5 sm:col-span-2">
              <textarea dir="rtl" className="min-h-24 w-full resize-y break-words rounded-md border bg-background px-3 py-2 text-sm leading-6" placeholder="value|الاسم الظاهر، خيار في كل سطر" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} />
              <p className="text-[11px] text-muted-foreground">استخدم الصيغة value|الاسم الظاهر. احتفظ بقيمة value الحالية عند تعديل الاسم حتى لا تتغير البيانات المخزنة.</p>
            </div>
          )}
          <Input dir="ltr" type="number" placeholder="الترتيب" value={String(form.sortOrder)} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} /> مطلوب</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.showOnCard} onChange={(e) => setForm({ ...form, showOnCard: e.target.checked })} /> يظهر في البطاقة</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.showOnPage} onChange={(e) => setForm({ ...form, showOnPage: e.target.checked })} /> يظهر في الصفحة</label>
          <Button size="sm" onClick={save} disabled={create.isPending || update.isPending || !form.key.trim() || !form.labelAr.trim()} className="gap-1"><Save className="h-3.5 w-3.5" /> {editingId ? 'حفظ التعديل' : 'حفظ الحقل'}</Button>
        </div>
      )}
      {fields.length === 0 && !open && !editingId && (
        <div className="rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">لا توجد حقول ديناميكية لهذا النوع بعد.</div>
      )}
      {fields.map((field: StoreTypeField) => (
        <div key={field.id} dir="rtl" className="flex min-w-0 flex-col items-stretch gap-2 rounded-lg border border-border/60 px-2.5 py-2 text-right text-xs sm:flex-row sm:flex-wrap sm:items-center">
          <Badge variant="outline" className="max-w-full self-start break-all sm:self-auto">{field.key}</Badge><Badge variant={field.scope === 'PRODUCT' ? 'soft-accent' : 'outline'}>{field.scope === 'PRODUCT' ? 'منتج' : 'متجر'}</Badge><span className="min-w-0 break-words leading-5">{field.labelAr}</span>{field.showOnCard && <Badge variant="outline">بطاقة</Badge>}{field.showOnPage !== false && <Badge variant="outline">صفحة</Badge>}<Badge variant="outline">{field.type}</Badge>{field.required && <Badge>مطلوب</Badge>}<Button size="sm" variant="ghost" className="min-h-9 sm:min-h-8" onClick={() => startEdit(field)}><Pencil className="h-3.5 w-3.5" /> تعديل</Button>
          <Button size="sm" variant="ghost" className="min-h-9 sm:min-h-8" disabled={update.isPending} onClick={() => update.mutate({ storeTypeId, fieldId: field.id, payload: { isActive: !field.isActive } })}><Power className="h-3.5 w-3.5" />{field.isActive ? 'تعطيل' : 'تفعيل'}</Button>
        </div>
      ))}
    </div>
  );
}
