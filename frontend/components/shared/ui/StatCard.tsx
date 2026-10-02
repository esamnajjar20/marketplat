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
      <CardContent className="flex items-center gap-3 p-4">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-muted">
          <Icon className="h-5 w-5 text-muted-foreground" />
        </div>
        <div>
          <p className="text-2xl font-bold leading-none">
            {typeof value === 'number' ? (value ?? 0).toLocaleString('ar') : value}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">{label}</p>
        </div>
      </CardContent>
    </Card>
  );
}
