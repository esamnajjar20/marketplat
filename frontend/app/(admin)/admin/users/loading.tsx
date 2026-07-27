import { TableSkeleton } from '@/components/shared/skeletons';

export default function AdminUsersLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-40 rounded bg-muted animate-pulse" />
      <TableSkeleton rows={10} columns={5} />
    </div>
  );
}
