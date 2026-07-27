/**
 * FIX AUDIT-V4-03: previously rendered MessageThread + ConversationList
 * for an arbitrary :id with no backend to actually resolve it against
 * (no Conversation model/endpoint exists). Redirects to the parent
 * /messages page, which now shows an explicit "coming soon" state
 * instead of a fake per-conversation UI that could never show real data.
 */
import { redirect } from 'next/navigation';

export default function ConversationPage() {
  redirect('/messages');
}
