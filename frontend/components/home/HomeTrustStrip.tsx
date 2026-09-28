'use client';

/**
 * شريط ثقة مختصر — طمأنة سريعة بدون إطالة الصفحة.
 */
import { ShieldCheck, MapPin, Handshake } from 'lucide-react';
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

export function HomeTrustStrip({ className }: { className?: string }) {
  return (
    <section
      className={cn('container mx-auto max-w-7xl px-4', className)}
      aria-label="لماذا سوق غزة"
    >
      <ul className="grid grid-cols-3 gap-2 sm:gap-3">
        {ITEMS.map(({ icon: Icon, title, desc }) => (
          <li
            key={title}
            className="flex flex-col items-center gap-1.5 rounded-2xl border border-border/70 bg-card/70 px-2 py-3 text-center shadow-xs sm:flex-row sm:items-start sm:gap-3 sm:px-4 sm:py-3.5 sm:text-start"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Icon className="h-4 w-4" aria-hidden />
            </span>
            <span className="min-w-0">
              <span className="block text-xs font-bold text-foreground sm:text-sm">{title}</span>
              <span className="mt-0.5 line-clamp-2 text-[10px] leading-snug text-muted-foreground sm:text-[11px]">
                {desc}
              </span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
