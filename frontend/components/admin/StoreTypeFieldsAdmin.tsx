'use client';

import { useState } from 'react';
import { Pencil, Plus, Power, Save } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { Badge } from '@/components/shared/ui/Badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/shared/ui/Select';
import { useAdminStoreTypeFields } from '@/hooks/queries/useAdmin';
import { useAdminCreateStoreTypeField, useAdminUpdateStoreTypeField } from '@/hooks/mutations/useAdminMutations';
import type { StoreFieldType, StoreTypeField } from '@/types/store.types';

export function StoreTypeFieldsAdmin({ storeTypeId }: { storeTypeId: string }) {
  const { data: fields = [] } = useAdminStoreTypeFields(storeTypeId);
  const create = useAdminCreateStoreTypeField();
  const update = useAdminUpdateStoreTypeField();
  const [open, setOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ key: '', labelAr: '', type: 'TEXT' as StoreFieldType, required: false, options: '' });

  function startEdit(field: StoreTypeField) {
    setEditingId(field.id);
    // FIX SELECT-VALUE-PRESERVE: carry each option's value alongside its
    // label so editing a label does NOT change the stored value. Otherwise
    // every store's existing attributes would fail validation on their
    // next update (value mismatch against the regenerated options).
    setForm({ key: field.key, labelAr: field.labelAr, type: field.type, required: field.required, options: (field.options ?? []).map((o) => `${o.labelAr}|${o.value}`).join('\n') });
  }

  function save() {
    if (!form.key.trim() || !form.labelAr.trim()) return;
    const options = form.type === 'SELECT'
      ? form.options.split('\n').map((line) => line.trim()).filter(Boolean).map((line) => {
          // FIX SELECT-VALUE-PRESERVE: line format "label|value" (or just
          // "label" for new options). Default to '' so TS sees strings.
          const [labelPart = '', valuePart = ''] = line.split('|').map((s) => s.trim());
          return { labelAr: labelPart, value: valuePart || labelPart.toLowerCase().replace(/\s+/g, '_') };
        })
      : undefined;
    const payload = { labelAr: form.labelAr.trim(), type: form.type, required: form.required, options: form.type === 'SELECT' ? options : null };
    if (editingId) {
      update.mutate({ storeTypeId, fieldId: editingId, payload }, {
        onSuccess: () => { setEditingId(null); setForm({ key: '', labelAr: '', type: 'TEXT', required: false, options: '' }); },
      });
      return;
    }
    create.mutate({ storeTypeId, payload: { key: form.key.trim(), ...payload } }, {
      onSuccess: () => { setOpen(false); setForm({ key: '', labelAr: '', type: 'TEXT', required: false, options: '' }); },
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
          <Input placeholder="الاسم بالعربية" value={form.labelAr} onChange={(e) => setForm({ ...form, labelAr: e.target.value })} />
          <Select value={form.type} onValueChange={(v) => setForm({ ...form, type: v as StoreFieldType })}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="TEXT">نص</SelectItem><SelectItem value="NUMBER">رقم</SelectItem><SelectItem value="BOOLEAN">نعم/لا</SelectItem><SelectItem value="SELECT">اختيار</SelectItem>
            </SelectContent>
          </Select>
          {form.type === 'SELECT' && <textarea className="min-h-20 rounded-md border bg-background px-3 py-2 text-sm" placeholder="خيار في كل سطر" value={form.options} onChange={(e) => setForm({ ...form, options: e.target.value })} />}
          <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={form.required} onChange={(e) => setForm({ ...form, required: e.target.checked })} /> مطلوب</label>
          <Button size="sm" onClick={save} disabled={create.isPending || update.isPending} className="gap-1"><Save className="h-3.5 w-3.5" /> {editingId ? 'حفظ التعديل' : 'حفظ الحقل'}</Button>
        </div>
      )}
      {fields.map((field: StoreTypeField) => (
        <div key={field.id} className="flex flex-wrap items-center gap-2 text-xs">
          <Badge variant="outline">{field.key}</Badge><span>{field.labelAr}</span><Badge variant="outline">{field.type}</Badge>{field.required && <Badge>مطلوب</Badge>}<Button size="sm" variant="ghost" onClick={() => startEdit(field)}><Pencil className="h-3.5 w-3.5" /> تعديل</Button>
          <Button size="sm" variant="ghost" disabled={update.isPending} onClick={() => update.mutate({ storeTypeId, fieldId: field.id, payload: { isActive: !field.isActive } })}><Power className="h-3.5 w-3.5" />{field.isActive ? 'تعطيل' : 'تفعيل'}</Button>
        </div>
      ))}
    </div>
  );
}
