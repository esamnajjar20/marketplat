'use client';

import { useState, type FormEvent } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2 } from 'lucide-react';
import { serviceCategoriesApi } from '@/api/service-categories.api';
import { useCreateServiceBroadcast } from '@/hooks/mutations/useServiceBroadcastMutations';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';

export function CreateServiceBroadcastForm() {
  const [categoryId, setCategoryId] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [city, setCity] = useState('');
  const create = useCreateServiceBroadcast();

  const { data: categories, isLoading: catsLoading } = useQuery({
    queryKey: ['service-categories'],
    queryFn: () => serviceCategoriesApi.getAll().then((r) => r.data.data ?? []),
  });

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!categoryId || title.trim().length < 5 || description.trim().length < 10) return;
    create.mutate({
      categoryId,
      title: title.trim(),
      description: description.trim(),
      city: city.trim() || undefined,
    });
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

      <Button type="submit" disabled={!canSubmit} className="w-full gap-2">
        {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
        نشر الطلب في السوق
      </Button>
    </form>
  );
}
