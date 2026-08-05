'use client';

/**
 * FIX INTEG-07: the "الإبلاغ عن هذا الإعلان" link in AdDetail.tsx had no
 * onClick — api/reports.api.ts (reportsApi.reportAd) was fully implemented
 * and tested, but nothing in the UI ever called it. Follows
 * EditCategoryButton.tsx's dialog + mutation pattern.
 */
import { useState } from 'react';
import { Flag } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
import { useReportAd } from '@/hooks/mutations/useReportMutations';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { toast } from 'sonner';
import type { ReportReason } from '@/types/admin.types';

const REASON_LABELS: Record<ReportReason, string> = {
  SCAM:      'عملية احتيال',
  FAKE:      'إعلان وهمي أو مضلل',
  OFFENSIVE: 'محتوى مسيء',
  SPAM:      'رسائل مزعجة (سبام)',
};

interface Props {
  adId: string;
}

export function ReportAdButton({ adId }: Props) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('SCAM');
  const [notes, setNotes] = useState('');
  const isAuth = useAuthStore(selectIsAuthenticated);
  const reportAd = useReportAd(adId);

  function handleOpen() {
    if (!isAuth) { toast.error('يرجى تسجيل الدخول أولاً'); return; }
    setReason('SCAM');
    setNotes('');
    setOpen(true);
  }

  function handleSubmit() {
    reportAd.mutate(
      { reason, notes: notes.trim() || undefined },
      { onSuccess: () => setOpen(false) },
    );
  }

  return (
    <>
      <button
        onClick={handleOpen}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-destructive transition-colors"
      >
        <Flag className="h-3.5 w-3.5" />
        الإبلاغ عن هذا الإعلان
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>الإبلاغ عن الإعلان</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1.5">
              <label htmlFor="report-reason" className="text-sm font-medium">سبب الإبلاغ</label>
              <Select value={reason} onValueChange={(v) => setReason(v as ReportReason)}>
                <SelectTrigger id="report-reason"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.entries(REASON_LABELS).map(([value, label]) => (
                    <SelectItem key={value} value={value}>{label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="report-notes" className="text-sm font-medium">
                تفاصيل إضافية <span className="text-muted-foreground">(اختياري)</span>
              </label>
              <textarea
                id="report-notes"
                rows={3}
                maxLength={500}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="أخبرنا بالمزيد عن سبب الإبلاغ..."
                className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
              />
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>إلغاء</Button>
              <Button variant="destructive" onClick={handleSubmit} disabled={reportAd.isPending}>
                {reportAd.isPending ? 'جارٍ الإرسال…' : 'إرسال البلاغ'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
