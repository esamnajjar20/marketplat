'use client';

import { FormEvent, useState } from 'react';
import { useCreateRequest } from '@/hooks/mutations/useRequestMutations';
import type { RequestType } from '@/types/request.types';
import { REQUEST_TYPE_LABEL } from '@/lib/requestStatus';
import { Button } from '@/components/shared/ui/Button';

const TYPES: RequestType[] = ['SERVICE', 'PRODUCT', 'RENTAL'];

export function CreateRequestForm() {
  const create = useCreateRequest();
  const [type, setType] = useState<RequestType>('SERVICE');
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const [budgetMax, setBudgetMax] = useState('');
  const [budgetMin, setBudgetMin] = useState('');

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId.trim() || title.trim().length < 5 || description.trim().length < 10) return;
    create.mutate({
      type,
      categoryId: categoryId.trim(),
      title: title.trim(),
      description: description.trim(),
      city: city.trim() || undefined,
      budgetMin: budgetMin ? Number(budgetMin) : undefined,
      budgetMax: budgetMax ? Number(budgetMax) : undefined,
    });
  }

  return (
    <form onSubmit={onSubmit} className="mx-auto flex max-w-lg flex-col gap-4" dir="rtl">
      <div>
        <label className="mb-1 block text-sm font-medium">نوع الطلب</label>
        <select
          className="w-full rounded-md border bg-background px-3 py-2"
          value={type}
          onChange={(e) => setType(e.target.value as RequestType)}
        >
          {TYPES.map((t) => (
            <option key={t} value={t}>
              {REQUEST_TYPE_LABEL[t]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">معرّف الفئة (categoryId)</label>
        <input
          className="w-full rounded-md border bg-background px-3 py-2"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
          placeholder="الصق معرف الفئة المناسب للنوع"
          required
        />
        <p className="mt-1 text-xs text-muted-foreground">
          SERVICE → فئات الخدمات · PRODUCT → فئات المنتجات · RENTAL → فئات الإعلانات
        </p>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">العنوان</label>
        <input
          className="w-full rounded-md border bg-background px-3 py-2"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          minLength={5}
          maxLength={150}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">التفاصيل</label>
        <textarea
          className="min-h-[120px] w-full rounded-md border bg-background px-3 py-2"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          minLength={10}
          maxLength={1000}
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium">المدينة (اختياري)</label>
        <input
          className="w-full rounded-md border bg-background px-3 py-2"
          value={city}
          onChange={(e) => setCity(e.target.value)}
        />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium">ميزانية من (اختياري)</label>
          <input
            type="number"
            step="0.01"
            className="w-full rounded-md border bg-background px-3 py-2"
            value={budgetMin}
            onChange={(e) => setBudgetMin(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium">ميزانية إلى (اختياري)</label>
          <input
            type="number"
            step="0.01"
            className="w-full rounded-md border bg-background px-3 py-2"
            value={budgetMax}
            onChange={(e) => setBudgetMax(e.target.value)}
          />
        </div>
      </div>
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? 'جاري النشر…' : 'نشر الطلب'}
      </Button>
    </form>
  );
}
