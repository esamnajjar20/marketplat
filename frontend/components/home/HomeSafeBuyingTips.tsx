'use client';

import { useState } from 'react';
import { ChevronDown, MessageCircle, MapPin, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

const STEPS = [
  {
    icon: MessageCircle,
    title: 'تواصل داخل المنصة',
    desc: 'ابدأ المحادثة من صفحة الإعلان أو المتجر واحتفظ بسجل واضح.',
  },
  {
    icon: MapPin,
    title: 'اتفق على مكان عام',
    desc: 'يفضّل اللقاء في مكان مفتوح ومألوف، خاصة للصفقات الأولى.',
  },
  {
    icon: ShieldAlert,
    title: 'أبلغ عند الشك',
    desc: 'استخدم زر الإبلاغ على الإعلان أو الملف — المتابعة متاحة عند الحاجة.',
  },
] as const;

/**
 * short collapsible “buy safely” guide near the bottom of home.
 * Closed by default so it does not compete with discovery sections.
 */
export function HomeSafeBuyingTips() {
  const [open, setOpen] = useState(false);

  return (
    <section className="py-1 sm:py-2">
      <div className="overflow-hidden rounded-2xl border border-border/70 bg-card/60 shadow-xs">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-12 w-full items-center justify-between gap-3 px-3 py-3.5 text-start transition-colors hover:bg-muted/40 active:bg-muted/50 sm:min-h-0 sm:px-4 sm:py-3"
          aria-expanded={open}
        >
          <span className="min-w-0">
            <span className="block text-sm font-bold text-foreground">كيف تشتري بأمان؟</span>
            <span className="mt-0.5 block text-xs text-muted-foreground">
              ثلاث خطوات بسيطة قبل إتمام أي صفقة
            </span>
          </span>
          <ChevronDown
            className={cn(
              'h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-200',
              open && 'rotate-180',
            )}
            aria-hidden
          />
        </button>

        {open ? (
          <ol className="grid gap-3 border-t border-border/60 px-4 py-4 sm:grid-cols-3">
            {STEPS.map(({ icon: Icon, title, desc }, i) => (
              <li key={title} className="flex gap-3 sm:flex-col sm:gap-2">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
                  <Icon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">
                    <span className="me-1.5 text-muted-foreground">{i + 1}.</span>
                    {title}
                  </span>
                  <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
                    {desc}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        ) : null}
      </div>
    </section>
  );
}
