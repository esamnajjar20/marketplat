'use client';

import { useState } from 'react';
import { Button } from '@/components/shared/ui/Button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/shared/ui/Dialog';
import { AvailabilityCalendar } from './AvailabilityCalendar';
import { useCreateAppointment } from '@/hooks/mutations/useAppointmentMutations';
import { formatDateTime } from '@/lib/formatters';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The provider's own ServiceProviderDetails.id — the caller must own
   * this provider profile (enforced server-side by requireOwnProvider). */
  providerId: string;
  /** When booking against an accepted service request — omit for a
   * standalone appointment with no linked request. */
  requestId?: string;
  /** Shown for context when opened from a request row. */
  contextLabel?: string;
}

const MAX_NOTES_LENGTH = 500;

/**
 * CreateAppointmentDialog — Epic 4. Two entry points share this same
 * dialog: a standalone "احجز موعد" button on the appointments page
 * (no requestId), and a per-row action on an ACCEPTED/IN_PROGRESS
 * request in IncomingServiceRequestsList (requestId set) — mirrors how
 * ReviewServiceRequestDialog is shared the same way from a list row.
 */
export function CreateAppointmentDialog({
  open,
  onOpenChange,
  providerId,
  requestId,
  contextLabel,
}: Props) {
  const [selectedRange, setSelectedRange] = useState<{ start: string; end: string } | null>(null);
  const [notes, setNotes] = useState('');
  const createAppointment = useCreateAppointment();

  // UX-FIX P1-2: block Escape / overlay-click / cancel-button close while
  // createAppointment is in flight. Previously this only reset local form
  // state on close with no pending check at all, so closing and reopening
  // mid-request (this dialog is reused across two entry points) could
  // submit a second booking attempt before the first one resolved.
  function handleClose(next: boolean) {
    if (!next && createAppointment.isPending) return;
    if (!next) {
      setSelectedRange(null);
      setNotes('');
    }
    onOpenChange(next);
  }

  function handleSubmit() {
    if (!selectedRange) return;
    createAppointment.mutate(
      {
        requestId,
        scheduledStart: selectedRange.start,
        scheduledEnd: selectedRange.end,
        notes: notes.trim() || undefined,
      },
      { onSuccess: () => handleClose(false) }
    );
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[calc(100dvh-1.5rem)] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>حجز موعد</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {contextLabel && (
            <p className="text-sm text-muted-foreground line-clamp-1">{contextLabel}</p>
          )}

          <AvailabilityCalendar providerId={providerId} onSelectRange={setSelectedRange} />

          {selectedRange && (
            <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm">
              الموعد المختار: {formatDateTime(selectedRange.start)}
            </div>
          )}

          <div className="space-y-1.5">
            <label htmlFor="appointment-notes" className="text-sm font-medium">
              ملاحظات (اختياري)
            </label>
            <textarea
              id="appointment-notes"
              rows={3}
              maxLength={MAX_NOTES_LENGTH}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="أي تفاصيل إضافية عن الموعد..."
              className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring resize-none"
            />
            <p className="text-xs text-muted-foreground text-end">
              {notes.length}/{MAX_NOTES_LENGTH}
            </p>
          </div>

          <div className="flex justify-end gap-2">
            <Button
              variant="outline"
              onClick={() => handleClose(false)}
              disabled={createAppointment.isPending}
            >
              إلغاء
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={!selectedRange || createAppointment.isPending}
            >
              {createAppointment.isPending ? 'جارٍ الحجز…' : 'تأكيد الحجز'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
