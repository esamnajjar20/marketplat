/**
 * FIX AUDIT-V4-03: previously rendered ConversationList + MessageThread
 * (now deleted — both were explicitly documented as placeholders with
 * no real backend: no Conversation/Message Prisma models, no
 * endpoints). A user who reached this page directly (bypassing the
 * disabled "مراسلة البائع" button in SellerCard.tsx) saw what looked
 * like a real, functioning messaging UI that always showed zero
 * conversations — indistinguishable from "you have no messages yet"
 * when the actual situation is "this feature doesn't exist yet."
 * Replaced with an explicit, honest "coming soon" state matching the
 * language already used on the disabled button elsewhere in the app.
 */
import { MessageSquare } from 'lucide-react';
import { EmptyState } from '@/components/shared/feedback/EmptyState';

export default function MessagesPage() {
  return (
    <div className="h-[calc(100vh-8rem)] flex items-center justify-center rounded-lg border bg-card">
      <EmptyState
        icon={<MessageSquare className="h-10 w-10" />}
        title="ميزة المراسلة قيد التطوير"
        description="نعمل على إضافة نظام المراسلة بين المشترين والبائعين. سيتم إعلامك عند توفره."
      />
    </div>
  );
}
