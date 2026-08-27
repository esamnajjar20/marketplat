/**
 * Desktop empty pane when no conversation is selected.
 * Mobile never sees this — layout shows the inbox list instead.
 */
import type { Metadata } from 'next';
import { MessageSquare, ShieldCheck, Zap } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الرسائل', noIndex: true });

export default function MessagesPage() {
  return (
    <div className="hidden h-full flex-col items-center justify-center gap-6 p-10 text-center lg:flex bg-muted/10">
      <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary/10 text-primary shadow-sm">
        <MessageSquare className="h-8 w-8" aria-hidden />
      </div>
      <div className="space-y-2 max-w-sm">
        <p className="text-lg font-semibold text-foreground">اختر محادثة</p>
        <p className="text-sm text-muted-foreground leading-relaxed">
          اختر محادثة من القائمة لعرض الرسائل والرد فوراً.
        </p>
      </div>
      <ul className="flex flex-col gap-2.5 text-start text-xs text-muted-foreground max-w-xs">
        <li className="flex items-start gap-2.5 rounded-lg border bg-card/80 px-3 py-2.5">
          <Zap className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span>ردود سريعة وقوالب جاهزة للتفاوض</span>
        </li>
        <li className="flex items-start gap-2.5 rounded-lg border bg-card/80 px-3 py-2.5">
          <ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
          <span>تفاوض داخل المنصة — لا تدفع مقدّماً خارجها</span>
        </li>
      </ul>
    </div>
  );
}
