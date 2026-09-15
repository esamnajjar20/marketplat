'use client';

/**
 * أدوات سريعة على الرئيسية — بدون QR / دفع سريع (النظام غير مستقر).
 * المحفوظات والتنزيلات هما المدخلان الرئيسيان.
 */
import Link from 'next/link';
import { Bookmark, Download } from 'lucide-react';
import { ROUTES } from '@/lib/constants';
import { cn } from '@/lib/utils';

export function HomeQuickActions({ className }: { className?: string }) {
  return (
    <section className={cn('container mx-auto max-w-7xl px-4', className)}>
      <div className="rounded-2xl border border-border/80 bg-card/80 p-3 shadow-xs sm:p-4">
        <p className="mb-3 text-sm font-semibold text-foreground">محفوظاتك على الجهاز</p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Link
            href={ROUTES.savedPayments}
            className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl bg-primary px-4 py-4 text-primary-foreground transition-colors hover:bg-primary/90 active:scale-[0.99]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary-foreground/15">
              <Bookmark className="h-6 w-6" aria-hidden />
            </span>
            <span className="min-w-0 text-start">
              <span className="block text-base font-bold">المحفوظات</span>
              <span className="block text-xs font-normal text-primary-foreground/85">
                جهات الدفع وبطاقات النت — إضافة وتعديل محليًا
              </span>
            </span>
          </Link>
          <Link
            href={ROUTES.downloads}
            className="flex min-h-[4.5rem] items-center gap-3 rounded-2xl border-2 border-primary/30 bg-background px-4 py-4 text-foreground transition-colors hover:border-primary/50 hover:bg-primary-soft active:scale-[0.99]"
          >
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Download className="h-6 w-6" aria-hidden />
            </span>
            <span className="min-w-0 text-start">
              <span className="block text-base font-bold">التنزيلات</span>
              <span className="block text-xs font-normal text-muted-foreground">
                كتالوجات المتاجر المحفوظة للعمل دون اتصال
              </span>
            </span>
          </Link>
        </div>
      </div>
    </section>
  );
}
