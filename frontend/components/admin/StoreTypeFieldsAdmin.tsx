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
  const EMPTY_FORM = { key: '', labelAr: '', cardLabelAr: '', pageLabelAr: '', showOnCard: false, showOnPage: true, type: 'TEXT' as StoreFieldType, scope: 'STORE' as StoreFieldScope, required: false, options: '', sortOrder: 0 };
  const [form, setForm] = useState(EMPTY_FORM);

  function startEdit(field: StoreTypeField) {
    setEditingId(field.id);
    setForm({ key: field.key, labelAr: field.labelAr, cardLabelAr: field.cardLabelAr ?? '', pageLabelAr: field.pageLabelAr ?? field.labelAr, showOnCard: field.showOnCard ?? false, showOnPage: field.showOnPage ?? true, type: field.type, scope: field.scope ?? 'STORE', required: field.required, options: (field.options ?? []).map((o) => o.labelAr).join('\n'), sortOrder: field.sortOrder });
  }

  function save() {
    if (!form.key.trim() || !form.labelAr.trim()) return;
    const options = form.type === 'SELECT'
      ? form.options.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => ({ value: line.toLowerCase().replace(/\s+/g, '_'), labelAr: line }))
      : undefined;
    const payload = { labelAr: form.labelAr.trim(), cardLabelAr: form.cardLabelAr.trim() || null, pageLabelAr: form.pageLabelAr.trim() || form.labelAr.trim(), showOnCard: form.showOnCard, showOnPage: form.showOnPage, type: form.type, scope: form.scope, required: form.required, options: form.type === 'SELECT' ? options : null, sortOrder: Number(form.sortOrder) };
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
    <div className="mt-3 border-t pt-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-semibold">الحقول الديناميكية ({fields.length}/20)</span>
        <Button size="sm" variant="outline" className="gap-1" onClick={() => { setEditingId(null); setOpen((v) => !v); }} disabled={fields.length >= 20}><Plus className="h-3.5 w-3.5" /> حقل</Button>
      </div>
      {(open || editingId) && (
        <div className="grid gap-2 rounded-lg bg-muted/40 p-3 sm:grid-cols-2">
          <Input placeholder="المفتاح: prep_time" value={form.key} disabled={Boolean(editingId)} onChange={(e) => setForm({ ...form, key: e.target.value })} />
          <Input placeholder="الاسم الأساسي" value={form.labelAr} onChange={(e) => setForm({ ...form, labelAr: e.target.value })} />
          <Input placeholder="اسم الحقل في البطاقة" value={form.cardLabelAr} onChange={(e) => setForm({ ...form, cardLabelAr: e.target.value })} />
          <Input placeholder="اسم الحقل في الصفحة" value={form.pageLabelAr} onChange={(e) => setForm({ ...form, pageLabelAr: e.target.value })} />
          <Select value={form.scope} onValueChange={(v) => setForm({ ...form, scope: v as StoreFieldScope })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent><SelectItem value="STORE">المتجر</SelectItem><SelectItem value="PRODUCT">المنتج</SelectItem></SelectContent>
          </Select>
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as StoreFieldType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TEXT">نص</SelectItem><SelectItem value="NUMBER">رقم</SelectItem><SelectItem value="BOOLEAN">نعم/لا</SelectItem><SelectItem value="SELECT">اختيار</SelectItem>
            </SelectContent>
          </Select>
          {form.type === 'SELECT' && <textarea className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm" placeholder="خيار في كل سطر" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} />}
          <Input type="number" placeholder="الترتيب" value={String(form.sortOrder)} onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })} />
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} /> مطلوب</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.showOnCard} onChange={(e) => setForm({ ...form, showOnCard: e.target.checked })} /> يظهر في البطاقة</label>
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.showOnPage} onChange={(e) => setForm({ ...form, showOnPage: e.target.checked })} /> يظهر في الصفحة</label>
          <Button size="sm" onClick={save} disabled={create.isPending || update.isPending} className="gap-1"><Save className="h-3.5 w-3.5" /> {editingId ? 'حفظ التعديل' : 'حفظ الحقل'}</Button>
        </div>
      )}
      {fields.map((field: StoreTypeField) => (
        <div key={field.id} className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">{field.key}</Badge><span>{field.labelAr}</span>{field.showOnCard && <Badge variant="outline">بطاقة</Badge>}{field.showOnPage !== false && <Badge variant="outline">صفحة</Badge>}<Badge variant="outline">{field.scope === 'PRODUCT' ? 'منتج' : 'متجر'}</Badge><Badge variant="outline">{field.type}</Badge>{field.required && <Badge>مطلوب</Badge>}<Button size="sm" variant="ghost" onClick={() => startEdit(field)}><Pencil className="h-3.5 w-3.5" /> تعديل</Button>
          <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => update.mutate({ storeTypeId, fieldId: field.id, payload: { isActive: !field.isActive } })}><Power className="h-3.5 w-3.5" />{field.isActive ? 'تعطيل' : 'تفعيل'}</Button>
        </div>
      ))}
    </div>
  );
}
