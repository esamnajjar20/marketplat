'use client';
import { HydrationSafeRelativeTime } from '@/components/shared/HydrationSafeRelativeTime';
import { Badge } from '@/components/shared/ui/Badge';
import { ShieldCheck } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { ApiError } from '@/components/shared/ApiError';
import { useAdminFraudSignals } from '@/hooks/queries/useAdmin';
import { useAdminReviewFraudSignal } from '@/hooks/mutations/useAdminMutations';
import { parseApiError } from '@/lib/errorParser';
import type { FraudSignalType } from '@/types/admin.types';
const SIGNAL_TYPE_LABELS: Record<FraudSignalType,string>={RAPID_POSTING:'نشر متسارع',SUSPICIOUS_PRICE:'سعر مشبوه',SUSPICIOUS_CONTACT_PATTERN:'نمط تواصل مشبوه',SUSPICIOUS_KEYWORDS:'كلمات مشبوهة',DUPLICATE_LISTING:'إعلان مكرر',NEW_ACCOUNT_HIGH_ACTIVITY:'حساب جديد بنشاط مرتفع',MANUAL_ADMIN_FLAG:'علامة يدوية من الإدارة'};
export function AdSignalsPanel({ adId }: { adId: string }) {
  const { data, isLoading, isError, error, refetch } = useAdminFraudSignals({ adId, limit: 20 });
  const reviewSignal = useAdminReviewFraudSignal();

  if (isLoading) return <div className="p-3 text-xs text-muted-foreground">جارِ التحميل…</div>;
  if (isError) {
    return (
      <div className="p-3">
        <ApiError error={parseApiError(error)} onRetry={() => refetch()} variant="inline" />
      </div>
    );
  }

  const signals = data?.items ?? [];
  if (signals.length === 0) {
    return <div className="p-3 text-xs text-muted-foreground">لا توجد إشارات مسجّلة لهذا الإعلان.</div>;
  }

  return (
    <div className="p-3 space-y-2">
      {signals.map((signal) => (
        <div key={signal.id} className="flex items-center justify-between gap-3 rounded-md border bg-background p-2">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className="text-xs shrink-0">
              {SIGNAL_TYPE_LABELS[signal.type] ?? signal.type}
            </Badge>
            <span className="text-xs text-muted-foreground shrink-0">وزن {signal.weight}</span>
            <span className="text-xs text-muted-foreground truncate">{<HydrationSafeRelativeTime date={signal.createdAt} />}</span>
          </div>
          {signal.reviewed ? (
            <Badge variant="outline" className="text-xs text-success shrink-0">تمت المراجعة</Badge>
          ) : (
            <Button
              variant="ghost" size="sm" className="h-7 shrink-0"
              disabled={reviewSignal.isPending && reviewSignal.variables === signal.id}
              onClick={() => reviewSignal.mutate(signal.id)}
            >
              <ShieldCheck className="h-3.5 w-3.5 me-1" />تأكيد المراجعة
            </Button>
          )}
        </div>
      ))}
    </div>
  );
}

