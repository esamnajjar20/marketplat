import type { LucideIcon } from 'lucide-react';
import { Card, CardContent } from '@/components/shared/ui/Card';

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  /** Numbers are formatted with the 'ar' locale; strings are rendered as given. */
  value: number | string;
}

export function StatCard({ icon: Icon, label, value }: StatCardProps) {
  return (
    <Card>
      <CardContent className="flex min-w-0 items-center gap-2.5 p-3 sm:gap-3 sm:p-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted sm:h-10 sm:w-10 sm:rounded-full">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div className="min-w-0">
          <p className="break-words text-xl font-bold leading-tight tabular-nums sm:text-2xl">
            {typeof value === 'number' ? (value ?? 0).toLocaleString('ar') : value}
          </p>
          <p className="mt-1 line-clamp-2 text-[11px] leading-4 text-muted-foreground sm:text-xs">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
