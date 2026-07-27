import { TableSkeleton } from '@/components/shared/skeletons';

export default function AdminReportsLoading() {
  return (
    <div className="space-y-6">
      <div className="h-8 w-44 rounded bg-muted animate-pulse" />
      <TableSkeleton rows={8} columns={5} />
    </div>
  );
}
