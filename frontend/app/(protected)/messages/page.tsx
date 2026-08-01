/**
 * Epic 5: replaces the "ميزة المراسلة قيد التطوير" placeholder that's
 * been here since FIX AUDIT-V4-03 (see the original comment this
 * replaced — that fix pulled a UI with no real backend behind it; the
 * conversations module now exists end-to-end, so this wires the real
 * thing instead of continuing to hide it).
 */
import type { Metadata } from 'next';
import { Suspense } from 'react';
import { ConversationList } from '@/components/messages/ConversationList';
import { LoadingSpinner } from '@/components/shared/feedback/LoadingSpinner';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'الرسائل', noIndex: true });

export default function MessagesPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">الرسائل</h1>
      <Suspense fallback={<div className="flex justify-center py-12"><LoadingSpinner /></div>}>
        <ConversationList />
      </Suspense>
    </div>
  );
}
