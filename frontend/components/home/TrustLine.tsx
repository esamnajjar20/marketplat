'use client';

import { ShieldCheck } from 'lucide-react';
import { cn } from '@/lib/utils';

/**
 * PLAN Phase 1 (القسم 3، البند 12): يستبدل HomeTrustStrip (3 بطاقات)
 * بسطر واحد خفيف — نفس الرسالة الثلاثية مدمجة نصًا بدل شبكة بطاقات.
 * HomeTrustStrip.tsx نفسه لم يُحذف من المشروع (قرار الخطة، القسم 4) —
 * فقط لم يعد مستوردًا في app/(public)/page.tsx.
 */
export function TrustLine({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'container mx-auto max-w-7xl px-4 py-3 text-center text-xs text-muted-foreground',
        className,
      )}
    >
      <span className="inline-flex items-center gap-1.5">
        <ShieldCheck className="h-3.5 w-3.5 text-primary" aria-hidden />
        منصة محلية · تواصل مباشر بلا وسطاء · إبلاغ ومتابعة عند الحاجة
      </span>
    </div>
  );
}
