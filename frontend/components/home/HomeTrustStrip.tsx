'use client';

import { MapPin, ShieldCheck, Megaphone } from 'lucide-react';
import { useAds } from '@/hooks/queries/useAds';
import { CITIES } from '@/lib/constants';
import { cn } from '@/lib/utils';

/**
 * شريط ثقة رفيع تحت الهيرو — يعطي إحساس سوق حي دون إعاقة الاكتشاف.
 */
export function HomeTrustStrip({ className }: { className?: string }) {
  const { data } = useAds({ limit: 1, sortBy: 'createdAt', sortOrder: 'desc' });
  const total = data?.meta?.total;

  const items = [
    {
      icon: MapPin,
      label: `${CITIES.length}+ مدن في القطاع`,
    },
    {
      icon: Megaphone,
      label:
        typeof total === 'number' && total > 0
          ? `${new Intl.NumberFormat('ar-EG').format(total)}+ إعلان`
          : 'إعلانات تتجدد يوميًا',
    },
    {
      icon: ShieldCheck,
      label: 'تواصل داخل التطبيق',
    },
  ];

  return (
    <div
      className={cn(
        'container mx-auto max-w-7xl px-4',
        className,
      )}
    >
      <ul className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-2xl border border-border/70 bg-surface-1/80 px-3 py-2.5 text-xs text-muted-foreground shadow-xs sm:gap-x-8 sm:text-sm">
        {items.map(({ icon: Icon, label }) => (
          <li key={label} className="flex items-center gap-1.5">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary-soft text-primary">
              <Icon className="h-3.5 w-3.5" aria-hidden />
            </span>
            <span className="font-medium text-foreground/80">{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
