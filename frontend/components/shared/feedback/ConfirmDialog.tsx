'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/shared/ui/Button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
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
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>
        {requireReason && (
          <div className="space-y-1.5 px-1">
            <label className="text-sm font-medium" htmlFor="confirm-reason">
              {reasonLabel}
            </label>
            <textarea
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={reasonPlaceholder}
              rows={3}
              disabled={isPending}
              className="w-full resize-y rounded-md border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
            {reason.trim().length > 0 && reason.trim().length < 3 && (
              <p className="text-xs text-destructive">السبب قصير جداً</p>
            )}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={() => handleOpenChange(false)} disabled={isPending}>
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? 'destructive' : 'default'}
            onClick={handleConfirm}
            disabled={isPending || !reasonOk}
          >
            {isPending ? confirmingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
