'use client';

import { X } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/shared/ui/Button';
import { ROUTES } from '@/lib/constants';

const LABELS: Record<string, string> = {
  city: 'المدينة',
  categoryId: 'الفئة',
  minPrice: 'السعر من',
  maxPrice: 'السعر إلى',
  condition: 'الحالة',
  sort: 'الترتيب',
};

function labelFor(key: string, value: string) {
  const condition = key === 'condition'
    ? ({ NEW: 'جديد', USED: 'مستعمل', REFURBISHED: 'مجدد' } as Record<string, string>)[value] ?? value
    : value;
  return `${LABELS[key] ?? key}: ${condition}`;
}

export function SearchActiveFilters() {
  const router = useRouter();
  const sp = useSearchParams();
  const keys = ['city', 'categoryId', 'minPrice', 'maxPrice', 'condition', 'sort'];
  const active = keys
    .map((key) => ({ key, value: sp.get(key) }))
    .filter(({ value, key }) => Boolean(value) && !(key === 'sort' && value === 'relevance')) as { key: string; value: string }[];
  const hasLocation = Boolean(sp.get('lat') || sp.get('lng'));

  if (!active.length && !hasLocation) return null;

  function clear(key: string) {
    const params = new URLSearchParams(sp.toString());
    params.delete(key);
    params.delete('page');
    router.replace(`${ROUTES.search}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  function clearLocation() {
    const params = new URLSearchParams(sp.toString());
    params.delete('lat');
    params.delete('lng');
    params.delete('radius');
    params.delete('page');
    router.replace(`${ROUTES.search}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  function clearAll() {
    const params = new URLSearchParams();
    const q = sp.get('q');
    const type = sp.get('type');
    if (q) params.set('q', q);
    if (type && type !== 'all') params.set('type', type);
    router.replace(`${ROUTES.search}${params.toString() ? `?${params.toString()}` : ''}`);
  }

  return (
    <div className="flex flex-wrap items-center gap-2" aria-label="الفلاتر النشطة">
      <span className="text-xs font-medium text-muted-foreground">محدداتك:</span>
      {active.map(({ key, value }) => (
        <Badge key={key} variant="outline" className="min-h-8 gap-1 rounded-full bg-card px-2.5 text-xs font-medium">
          {labelFor(key, value)}
          <button
            type="button"
            className="rounded-full p-0.5 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => clear(key)}
            aria-label={`إزالة ${LABELS[key] ?? key}`}
          >
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </Badge>
      ))}
      {hasLocation && (
        <Badge variant="outline" className="min-h-8 gap-1 rounded-full bg-card px-2.5 text-xs font-medium">
          بالقرب مني
          <button type="button" className="rounded-full p-0.5 hover:bg-muted" onClick={clearLocation} aria-label="إزالة الموقع">
            <X className="h-3.5 w-3.5" aria-hidden />
          </button>
        </Badge>
      )}
      <Button type="button" variant="ghost" className="h-8 rounded-full px-2.5 text-xs text-muted-foreground" onClick={clearAll}>
        مسح الكل
      </Button>
    </div>
  );
}
