'use client';

import { signalNavigationStart } from '@/components/shared/NavigationProgress';

/**
 * FEAT-REPORT-USER-STORE: extracted from ReportAdButton.tsx's dialog +
 * mutation pattern (itself from ) so ReportUserButton and
 * ReportStoreButton don't duplicate the same Select/textarea/submit
 * markup a third and fourth time. ReportAdButton now wraps this with
 * useReportAd bound in; behavior for ads is unchanged.
 */
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Flag } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/shared/ui/Select';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { ROUTES } from '@/lib/constants';
import { toast } from 'sonner';
import type { ReportReason } from '@/types/admin.types';
import type { CreateReportPayload } from '@/api/reports.api';
import type { UseMutationResult } from '@tanstack/react-query';

const REASON_LABELS: Record<ReportReason, string> = {
  SCAM:      'عملية احتيال',
  FAKE:      'محتوى وهمي أو مضلل',
  OFFENSIVE: 'محتوى مسيء',
  SPAM:      'رسائل مزعجة (سبام)',
};

interface Props<TData = unknown, TError = unknown> {
  /** Label shown on the trigger link, e.g. "الإبلاغ عن هذا الإعلان". */
  triggerLabel: string;
  /** Dialog title, e.g. "الإبلاغ عن الإعلان". */
  dialogTitle: string;
  // Props<TData, TError> instead of pinning both to a concrete type:
  // useReportAd/useReportUser/useReportStore each resolve to a slightly
  // different UseMutationResult (their mutationFn's TData/TError differ),
  // and this component only ever calls .mutate/.isPending — it never
  // reads TData or TError itself. Making the component generic lets
  // TypeScript infer the caller's concrete mutation type instead of
  // forcing `any` (or forcing every caller to fight variance) here.
  mutation: UseMutationResult<TData, TError, CreateReportPayload, unknown>;
}

export function ReportButton<TData, TError>({
  triggerLabel,
  dialogTitle,
  mutation,
}: Props<TData, TError>) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState<ReportReason>('SCAM');
  const [notes, setNotes] = useState('');
  const isAuth = useAuthStore(selectIsAuthenticated);

  function handleOpen() {
    if (!isAuth) {
      toast.error('يرجى تسجيل الدخول أولاً');
      const returnTo = typeof window !== 'undefined'
        ? `${window.location.pathname}${window.location.search}`
        : '/';
      const destination = `${ROUTES.login}?from=${encodeURIComponent(returnTo)}`;
      signalNavigationStart(destination);
      router.push(destination);
      return;
    }
    setReason('SCAM');
    setNotes('');
    setOpen(true);
  }

  function handleSubmit() {
    // Keep the draft intact and the dialog open when the request fails.
    // The pending guard is intentional even though the submit button is disabled.
    if (mutation.isPending) return;
    mutation.mutate(
      { reason, notes: notes.trim() || undefined },
      {
        onSuccess: () => setOpen(false),
        // Failures are already toasted by each report mutation hook
        // (parseApiError message); toasting again here produced two toasts
        // and a misleading "check your connection" text for server errors.
        // The dialog stays open and the draft intact, so the user can retry.
        onError: () => undefined,
      },
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="flex min-h-10 items-center gap-1.5 rounded-lg px-1.5 text-xs text-muted-foreground transition-colors hover:text-destructive"
      >
        <Flag className="h-3.5 w-3.5" />
        {triggerLabel}
      </button>
      <Dialog
        open={open}
        onOpenChange={(nextOpen) => {
          // Do not discard the form while a report is being submitted.
          if (mutation.isPending && !nextOpen) return;
          setOpen(nextOpen);
        }}
      >
        <DialogContent>
          <DialogHeader><DialogTitle>{dialogTitle}</DialogTitle></DialogHeader>
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
              <Button variant="outline" onClick={() => setOpen(false)} disabled={mutation.isPending}>إلغاء</Button>
              <Button variant="destructive" onClick={handleSubmit} loading={mutation.isPending} loadingText="جارٍ الإرسال…">
                إرسال البلاغ
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
