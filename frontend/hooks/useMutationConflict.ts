/**
 * CONFLICT-UX-01 — hook خفيف لعرض نتيجة تعارض mutation أونلاين.
 *
 * الاستخدام داخل onError لأي useMutation:
 *   onError: (err) => handleMutationConflict(err)
 */

import { useCallback } from 'react';
import { toast } from 'sonner';
import { conflictFromUnknown, type ConflictInfo } from '@/lib/conflictResolver';

export function useMutationConflict() {
  const handleMutationConflict = useCallback((err: unknown): ConflictInfo => {
    const info = conflictFromUnknown(err);
    const actionHint =
      info.primaryAction === 'edit'
        ? ' — راجع الحقول'
        : info.primaryAction === 'discard'
          ? ' — يمكن تجاهل العملية'
          : info.primaryAction === 'retry'
            ? ' — أعد المحاولة'
            : '';

    if (info.isTerminal) {
      toast.error(info.message + actionHint);
    } else if (info.kind === 'network') {
      toast.error(info.message);
    } else {
      toast.error(info.message + actionHint);
    }
    return info;
  }, []);

  return { handleMutationConflict };
}

/** نسخة بدون hook — للاستخدام خارج React (مثلاً في SW message handlers). */
export function toastMutationConflict(err: unknown): ConflictInfo {
  const info = conflictFromUnknown(err);
  toast.error(info.message);
  return info;
}
