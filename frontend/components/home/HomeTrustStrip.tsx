'use client';

/**
 * شريط ثقة مختصر — طمأنة سريعة بدون إطالة الصفحة. على الموبايل صف واحد
 * مضغوط (أيقونة + عنوان)، والوصف يظهر من sm فأعلى.
 */
import { ShieldCheck, MapPin, Handshake } from 'lucide-react';
import { useHomepage } from '@/hooks/queries/useHomepage';
import { cn } from '@/lib/utils';

const ITEMS = [
  {
    icon: MapPin,
    title: 'محلي',
    desc: 'نتائج أقرب لمدينتك',
  },
  {
    icon: Handshake,
    title: 'مباشر',
    desc: 'تواصل مع البائع أو مقدم الخدمة',
  },
  {
    icon: ShieldCheck,
    title: 'آمن',
    desc: 'إبلاغ ومتابعة عند الحاجة',
  },
] as const;

const nf = new Intl.NumberFormat('ar-EG');

/** Real counters from /home when available; otherwise the generic copy. */
function localDesc(stats: { activeAds: number; adsLast24h: number } | null | undefined): string {
  if (!stats || stats.activeAds <= 0) return ITEMS[0].desc;
  if (stats.adsLast24h > 0) return `+${nf.format(stats.adsLast24h)} إعلان جديد اليوم`;
  return `${nf.format(stats.activeAds)} إعلان نشط`;
}

export function HomeTrustStrip({ className }: { className?: string }) {
  const stats = useHomepage().data?.stats;
  return (
    <section
      className={cn('container mx-auto max-w-7xl px-4', className)}
      aria-label="لماذا سوق غزة"
    >
      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        {ITEMS.map(({ icon: Icon, title, desc: baseDesc }, index) => {
          const desc = index === 0 ? localDesc(stats) : baseDesc;
          return (
          <li
            key={title}
            className="flex items-center justify-center gap-1.5 rounded-2xl border border-border/70 bg-card/70 px-2 py-2 shadow-xs sm:items-start sm:justify-start sm:gap-3 sm:px-4 sm:py-3.5"
          >
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary sm:h-9 sm:w-9 sm:rounded-xl">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-foreground sm:text-sm">{title}</span>
              {/* الوصف مخفي على الموبايل لتقليل ارتفاع الـ fold */}
              <span className="mt-0.5 hidden line-clamp-2 text-[11px] leading-snug text-muted-foreground sm:block">
                {desc}
              </span>
            </span>
          </li>
          );
        })}
      </ul>
    </section>
  );
}
