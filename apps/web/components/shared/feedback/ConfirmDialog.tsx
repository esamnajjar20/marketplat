'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/shared/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/shared/ui/Dialog';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Use the destructive (red) button style for irreversible actions like delete. */
  destructive?: boolean;
  onConfirm: () => void;
  /**
   * pass the caller's mutation.isPending here. When provided,
   * the confirm button shows a loading label and is disabled while the
   * mutation is in flight, and the dialog does NOT auto-close on click —
   * previously it closed immediately regardless of the mutation's outcome,
   * so a failed delete looked identical to a successful one (the dialog
   * just vanished either way) and rapid Enter/Space presses could fire the
   * mutation multiple times before any response arrived.
   *
   * Callers should still close the dialog themselves (via onOpenChange)
   * from their mutation's onSuccess — see usage note below.
   */
  isPending?: boolean;
  confirmingLabel?: string;
  /** When true, shows a required reason textarea before confirm is enabled. */
  requireReason?: boolean;
  reasonLabel?: string;
  reasonPlaceholder?: string;
  /** Called with the trimmed reason when requireReason is on. */
  onConfirmWithReason?: (reason: string) => void;
}

/**
 * ConfirmDialog — a styled replacement for window.confirm().
 *
 * Usage pattern (controlled, so the same dialog works for any action):
 *   const [open, setOpen] = useState(false);
 *   const [target, setTarget] = useState<string | null>(null);
 *
 *   <Button onClick={() => { setTarget(ad.id); setOpen(true); }}>حذف</Button>
 *   <ConfirmDialog
 *     open={open}
 *     onOpenChange={setOpen}
 *     title="حذف الإعلان؟"
 *     description="لا يمكن التراجع عن هذا الإجراء."
 *     destructive
 *     onConfirm={() => target && deleteAd.mutate(target)}
 *   />
 *
 * with pending feedback, close the dialog yourself from
 * onSuccess instead of relying on auto-close:
 *   const deleteAd = useDeleteAd({ onSuccess: () => setOpen(false) });
 *   <ConfirmDialog
 *     ...
 *     isPending={deleteAd.isPending}
 *     onConfirm={() => target && deleteAd.mutate(target)}
 *   />
 */
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'تأكيد',
  cancelLabel = 'إلغاء',
  destructive = false,
  onConfirm,
  isPending,
  confirmingLabel = 'جارٍ التنفيذ…',
  requireReason = false,
  reasonLabel = 'السبب',
  reasonPlaceholder = 'اكتب سبب الإجراء (3 أحرف على الأقل)…',
  onConfirmWithReason,
}: ConfirmDialogProps) {
  const [reason, setReason] = useState('');
  useEffect(() => {
    if (!open) setReason('');
  }, [open]);
  // `isPending` being provided at all (not just its value)
  // is the signal that the caller has opted into pending-aware behavior.
  // Callers that pass isPending are expected to close the dialog
  // themselves (via onOpenChange) once their mutation's onSuccess fires,
  // so the dialog only disappears on a real, confirmed outcome — not
  // immediately on click regardless of what happens next.
  const isPendingAware = isPending !== undefined;

  const reasonOk = !requireReason || reason.trim().length >= 3;

  function handleConfirm() {
    if (requireReason) {
      if (!reasonOk) return;
      onConfirmWithReason?.(reason.trim());
      // Also call onConfirm for callers that ignore reason param
      if (!onConfirmWithReason) onConfirm();
    } else {
      onConfirm();
    }
    if (!isPendingAware) {
      onOpenChange(false);
    }
  }

  // Prevent closing (via Escape, overlay click, or the cancel button)
  // while a pending-aware mutation is in flight, so the user can't lose
  // track of an action that's still running on the server.
  function handleOpenChange(next: boolean) {
    if (isPending) return;
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="gap-0 overflow-hidden rounded-[20px] border-[#EAE3D6] p-0 sm:max-w-md">
        <div className="space-y-3 p-4 sm:p-5">
          <DialogHeader className="space-y-1.5 text-start">
            <DialogTitle className="text-[17px] font-extrabold text-foreground">{title}</DialogTitle>
            {description && (
              <DialogDescription className="text-[13px] leading-5 text-[#6B6459]">
                {description}
              </DialogDescription>
            )}
          </DialogHeader>
          {requireReason && (
            <div className="space-y-1.5">
              <label className="sr-only" htmlFor="confirm-reason">
                {reasonLabel}
              </label>
              <textarea
                id="confirm-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={reasonPlaceholder || 'صف المشكلة...'}
                rows={3}
                disabled={isPending}
                className="w-full resize-y rounded-[12px] border border-[#D9D1C3] bg-card px-3 py-2.5 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
              />
              {reason.trim().length > 0 && reason.trim().length < 3 && (
                <p className="text-[12px] text-[#9B2118]">السبب قصير جداً</p>
              )}
            </div>
          )}
          <div className="flex flex-wrap items-center justify-end gap-2 pt-1">
            <Button
              variant="outline"
              onClick={() => handleOpenChange(false)}
              disabled={isPending}
              className="h-10 min-w-[88px] rounded-full border-[#D9D1C3] bg-card px-4 text-[13px] font-bold text-[#1F4D33]"
            >
              {cancelLabel}
            </Button>
            <Button
              variant={destructive ? 'destructive' : 'default'}
              onClick={handleConfirm}
              disabled={isPending || !reasonOk}
              className={
                destructive
                  ? 'h-10 min-w-[120px] rounded-full bg-[#B3261E] px-4 text-[13px] font-bold text-white hover:bg-[#9B2118]'
                  : 'h-10 min-w-[120px] rounded-full bg-[#397F56] px-4 text-[13px] font-bold text-white hover:bg-[#1F4D33]'
              }
            >
              {isPending ? confirmingLabel : confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
