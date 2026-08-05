import type { Metadata } from 'next';
import { BlockedUsersList } from '@/components/profile/BlockedUsersList';
import { buildMetadata } from '@/lib/seo';

export const metadata: Metadata = buildMetadata({ title: 'المستخدمون المحظورون', noIndex: true });

export default function BlockedUsersPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-xl font-bold">المستخدمون المحظورون</h1>
      <BlockedUsersList />
    </div>
  );
}
