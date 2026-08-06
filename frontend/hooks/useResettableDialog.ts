'use client';

/**
 * useResettableDialog — shared "reset fields to source-of-truth on open"
 * pattern for edit dialogs.
 *
 * AUDIT-FIX (issue #7.1 / #5.8): EditCategoryButton, EditProductCategoryButton,
 * and EditServiceCategoryButton each hand-rolled the identical sequence —
 * a `handleOpen` that re-seeds every local field from the current
 * category before flipping `open` to true, so a dialog cancelled
 * mid-edit doesn't reopen with stale draft values. Same fields, same
 * ordering, same reasoning, copy-pasted three times and already
 * drifting (only the product/service variants also reset `icon`).
 *
 * This hook keeps the open/close state and the re-seed call in one
 * place; callers supply a `reset` function that sets their own local
 * fields from their own entity shape, so this doesn't need to know
 * about categories, icons, or any particular field set.
 */
import { useState, useCallback } from 'react';

export function useResettableDialog(reset: () => void) {
  const [open, setOpen] = useState(false);

  const handleOpen = useCallback(() => {
    reset();
    setOpen(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return { open, setOpen, handleOpen };
}
