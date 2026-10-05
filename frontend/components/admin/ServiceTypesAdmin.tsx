'use client';

import { useState } from 'react';
import { Pencil, Plus, Power, Save, Trash2, X } from 'lucide-react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { serviceTypesApi } from '@/api/service-types.api';
import { useServiceTypesForAdmin } from '@/hooks/queries/useServiceTypes';
import { queryKeys } from '@/lib/queryKeys';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { Badge } from '@/components/shared/ui/Badge';
import type { CreateServiceTypeFieldPayload, CreateServiceTypePayload, ServiceType, ServiceTypeField, ServiceTypeFieldType } from '@/types/service.types';

const FIELD_TYPES: ServiceTypeFieldType[] = ['TEXT', 'TEXTAREA', 'NUMBER', 'BOOLEAN', 'SELECT', 'MULTI_SELECT'];
const EMPTY_TYPE: CreateServiceTypePayload = { slug: '', name: '', nameAr: '', icon: 'Wrench', sortOrder: 0, isActive: true, capabilities: { allowedPricingTypes: ['FIXED', 'STARTING_FROM', 'NEGOTIABLE'], allowedLocations: ['AT_CUSTOMER', 'AT_PROVIDER', 'REMOTE'] } };

export function ServiceTypesAdmin() {
  const { data: types = [], isLoading } = useServiceTypesForAdmin();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [form, setForm] = useState<CreateServiceTypePayload>(EMPTY_TYPE);

  const invalidate = () => queryClient.invalidateQueries({ queryKey: queryKeys.serviceTypes.adminAll() });
  const create = useMutation({ mutationFn: serviceTypesApi.create, onSuccess: () => { toast.success('تم إنشاء نوع الخدمة'); invalidate(); setEditing(null); } });
  const update = useMutation({ mutationFn: ({ id, payload }: { id: string; payload: CreateServiceTypePayload }) => serviceTypesApi.update(id, payload), onSuccess: () => { toast.success('تم تحديث نوع الخدمة'); invalidate(); setEditing(null); } });

  function save() {
    if (!form.slug?.trim() || !form.nameAr?.trim() || !form.name?.trim()) return toast.error('أكمل بيانات النوع');
    if (editing === 'new') create.mutate({ ...form, slug: form.slug.trim(), name: form.name.trim(), nameAr: form.nameAr.trim() });
    else if (editing) update.mutate({ id: editing, payload: form });
  }

  return <div className="space-y-4">
    <div className="flex flex-wrap items-center justify-between gap-2">
      <p className="text-sm text-muted-foreground">إدارة مجالات الخدمات، خصائصها، وقدراتها. التعطيل يمنع استخدامها في الخدمات الجديدة.</p>
      <Button size="sm" className="gap-1.5" onClick={() => { setEditing('new'); setForm(structuredClone(EMPTY_TYPE)); }}><Plus className="h-4 w-4" /> نوع خدمة جديد</Button>
    </div>
    {editing === 'new' && <TypeEditor form={form} setForm={setForm} pending={create.isPending} onSave={save} onCancel={() => setEditing(null)} />}
    {isLoading ? <div className="rounded-xl border bg-card p-6 text-sm text-muted-foreground">جارٍ التحميل…</div> : <div className="grid gap-3">
      {types.map((type) => <ServiceTypeRow key={type.id} type={type} editing={editing} setEditing={setEditing} form={form} setForm={setForm} onSave={save} onCancel={() => setEditing(null)} pending={update.isPending} invalidate={invalidate} />)}
    </div>}
  </div>;
}

function ServiceTypeRow({ type, editing, setEditing, form, setForm, onSave, onCancel, pending, invalidate }: { type: ServiceType; editing: string | 'new' | null; setEditing: (v: string | null) => void; form: CreateServiceTypePayload; setForm: React.Dispatch<React.SetStateAction<CreateServiceTypePayload>>; onSave: () => void; onCancel: () => void; pending: boolean; invalidate: () => void }) {
  const [fieldOpen, setFieldOpen] = useState(false);
  const toggle = useMutation({ mutationFn: (isActive: boolean) => serviceTypesApi.update(type.id, { isActive }), onSuccess: invalidate });
  const removeField = useMutation({ mutationFn: serviceTypesApi.deleteField, onSuccess: () => { toast.success('تم حذف الحقل'); invalidate(); } });
  const addField = useMutation({ mutationFn: serviceTypesApi.createField, onSuccess: () => { toast.success('تمت إضافة الحقل'); invalidate(); setFieldOpen(false); } });
  const [field, setField] = useState<CreateServiceTypeFieldPayload>({ serviceTypeId: type.id, key: '', scope: 'LISTING', label: '', labelAr: '', cardLabelAr: null, pageLabelAr: null, type: 'TEXT', required: false, showOnCard: false, showOnPage: true, options: null, sortOrder: 0, isActive: true });
  if (editing === type.id) return <TypeEditor form={form} setForm={setForm} pending={pending} onSave={onSave} onCancel={onCancel} />;
  return <div className="rounded-xl border bg-card p-4 space-y-3">
    <div className="flex flex-wrap items-center gap-2"><span className="font-semibold">{type.nameAr}</span><Badge variant="outline">{type.slug}</Badge><Badge variant={type.isActive ? 'success' : 'outline'}>{type.isActive ? 'نشط' : 'غير نشط'}</Badge><span className="text-xs text-muted-foreground">{type._count?.categories ?? 0} فئة · {type._count?.listings ?? 0} خدمة</span></div>
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{type.fields.map((f) => <FieldRow key={f.id} field={f} onDelete={() => removeField.mutate(f.id)} />)}</div>
    {fieldOpen && <div className="rounded-lg border bg-background p-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
      <Input placeholder="key" value={field.key} onChange={e => setField(v => ({ ...v, key: e.target.value }))} />
      <Input placeholder="الاسم العربي" value={field.labelAr} onChange={e => setField(v => ({ ...v, labelAr: e.target.value }))} />
      <Input placeholder="English label" value={field.label} onChange={e => setField(v => ({ ...v, label: e.target.value }))} />
      <select className="h-10 rounded-md border bg-background px-3 text-sm" value={field.type} onChange={e => setField(v => ({ ...v, type: e.target.value as ServiceTypeFieldType }))}>{FIELD_TYPES.map(t => <option key={t}>{t}</option>)}</select>
      <Input placeholder="اسم البطاقة" value={field.cardLabelAr ?? ''} onChange={e => setField(v => ({ ...v, cardLabelAr: e.target.value || null, showOnCard: Boolean(e.target.value) }))} />
      <Input placeholder="الترتيب" type="number" value={String(field.sortOrder)} onChange={e => setField(v => ({ ...v, sortOrder: Number(e.target.value) }))} />
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={field.required} onChange={e => setField(v => ({ ...v, required: e.target.checked }))} /> مطلوب</label>
      <Button size="sm" disabled={addField.isPending || !field.key || !field.labelAr} onClick={() => addField.mutate(field)}><Save className="h-4 w-4" /> حفظ الحقل</Button>
    </div>}
    <div className="flex flex-wrap gap-2 border-t pt-3"><Button size="sm" variant="outline" className="gap-1.5" onClick={() => { setEditing(type.id); setForm({ slug: type.slug, name: type.name, nameAr: type.nameAr, icon: type.icon, labels: type.labels, capabilities: type.capabilities, presentation: type.presentation, sortOrder: type.sortOrder, isActive: type.isActive }); }}><Pencil className="h-3.5 w-3.5" /> تعديل</Button><Button size="sm" variant="outline" className="gap-1.5" onClick={() => toggle.mutate(!type.isActive)}><Power className="h-3.5 w-3.5" /> {type.isActive ? 'تعطيل' : 'تفعيل'}</Button><Button size="sm" variant="outline" className="gap-1.5" onClick={() => setFieldOpen(v => !v)}><Plus className="h-3.5 w-3.5" /> حقل ديناميكي</Button></div>
  </div>;
}

function FieldRow({ field, onDelete }: { field: ServiceTypeField; onDelete: () => void }) { return <div className="flex items-center justify-between gap-2 rounded-lg border p-2 text-xs"><div className="min-w-0"><div className="font-medium">{field.labelAr}</div><div className="text-muted-foreground">{field.key} · {field.type}{field.required ? ' · مطلوب' : ''}</div></div><Button size="sm" variant="ghost" onClick={onDelete} aria-label={`حذف ${field.labelAr}`}><Trash2 className="h-3.5 w-3.5" /></Button></div>; }

function TypeEditor({ form, setForm, pending, onSave, onCancel }: { form: CreateServiceTypePayload; setForm: React.Dispatch<React.SetStateAction<CreateServiceTypePayload>>; pending: boolean; onSave: () => void; onCancel: () => void }) { return <div className="rounded-xl border border-primary/25 bg-primary/5 p-4 space-y-3"><div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4"><Input placeholder="slug" disabled={Boolean(form.slug && form.slug !== '') && false} value={form.slug ?? ''} onChange={e => setForm(v => ({ ...v, slug: e.target.value }))} /><Input placeholder="name" value={form.name ?? ''} onChange={e => setForm(v => ({ ...v, name: e.target.value }))} /><Input placeholder="الاسم العربي" value={form.nameAr ?? ''} onChange={e => setForm(v => ({ ...v, nameAr: e.target.value }))} /><Input placeholder="الأيقونة" value={form.icon ?? ''} onChange={e => setForm(v => ({ ...v, icon: e.target.value }))} /><Input type="number" placeholder="الترتيب" value={String(form.sortOrder ?? 0)} onChange={e => setForm(v => ({ ...v, sortOrder: Number(e.target.value) }))} /></div><div className="flex gap-2"><Button size="sm" disabled={pending} onClick={onSave} className="gap-1.5"><Save className="h-3.5 w-3.5" /> حفظ</Button><Button size="sm" variant="outline" onClick={onCancel} className="gap-1.5"><X className="h-3.5 w-3.5" /> إلغاء</Button></div></div>; }
