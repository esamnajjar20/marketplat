/**
 * Epic 5: replaces the "ميزة المراسلة قيد التطوير" placeholder that's
 * been here since FIX AUDIT-V4-03 (see the original comment this
 * replaced — that fix pulled a UI with no real backend behind it; the
 * conversations module now exists end-to-end, so this wires the real
 * thing instead of continuing to hide it).
 *
 * DESKTOP-SPLIT-01: (protected)/messages/layout.tsx now owns
 * ConversationList entirely (both the <lg full-width inbox and the
 * >=lg sidebar pane come from one mount there — see that file's own
 * doc comment on why it's a single instance). This route's only job
 * left is the >=lg right-hand pane before any thread is selected —
 * layout.tsx already hides this page below lg since the list fills
 * that space instead there.
 */
import type { Metadata } from 'next';
import { MessageSquare } from 'lucide-react';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الرسائل', noIndex: true });

export default function MessagesPage() {
  return (
    <div className="hidden h-full flex-col items-center justify-center gap-3 p-12 text-center text-muted-foreground lg:flex">
      <MessageSquare className="h-10 w-10" />
      <div className="space-y-1">
        <p className="font-medium text-foreground">اختر محادثة</p>
        <p className="text-sm">اختر محادثة من القائمة لعرض الرسائل</p>
      </div>
    </div>
  );
}
