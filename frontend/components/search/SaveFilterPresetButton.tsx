'use client';

/**
 * Save current URL filters as a Saved Search (requires auth).
 * Place at: frontend/components/search/SaveFilterPresetButton.tsx
 *
 * Uses existing POST /saved-searches — no backend changes required.
 */

import { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { BookmarkPlus } from 'lucide-react';
import { Spinner } from '@/components/ui/spinner';
import { Button } from '@/components/shared/ui/Button';
import { Input } from '@/components/shared/ui/Input';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/shared/ui/Sheet';
import { savedSearchesApi } from '@/api/savedSearches.api';
import { parseSearchParams } from '@/lib/filterUrl';
import {
  filterStateToSavedFilters,
  hasSavableCriteria,
  suggestSavedSearchLabel,
} from '@/lib/filterSavedSearch';
import { trackFilterEvent } from '@/lib/filterAnalytics';
import { ROUTES } from '@/lib/constants';

interface Props {
  /** Optional: hide when user is logged out (parent can pass from auth store). */
  isAuthenticated?: boolean;
  className?: string;
}

export function SaveFilterPresetButton({ isAuthenticated = true, className }: Props) {
  const router = useRouter();
  const sp = useSearchParams();
  const state = parseSearchParams(new URLSearchParams(sp.toString()));

  const [open, setOpen] = useState(false);
  const [label, setLabel] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!hasSavableCriteria(state)) return null;

  function handleOpen() {
    if (!isAuthenticated) {
      router.push(`${ROUTES.login}?next=${encodeURIComponent(ROUTES.search)}`);
      return;
    }
    setLabel(suggestSavedSearchLabel(state));
    setError(null);
    setOpen(true);
  }

  async function handleSave() {
    const trimmed = label.trim();
    if (!trimmed) {
      setError('أدخل اسماً للبحث');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const filters = filterStateToSavedFilters(state);
      await savedSearchesApi.create({ label: trimmed, filters });
      trackFilterEvent({
        action: 'save_preset',
        presetLabel: trimmed,
        keys: Object.keys(filters).filter((k) => k !== 'type'),
        type: filters.type,
      });
      setOpen(false);
    } catch (e: unknown) {
      const msg =
        e && typeof e === 'object' && 'response' in e
          ? 'تعذر الحفظ — ربما وصلت للحد الأقصى (20) أو التسمية مكررة'
          : 'تعذر حفظ البحث';
      setError(msg);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={className ?? 'gap-1.5 rounded-full text-xs'}
        onClick={handleOpen}
      >
        <BookmarkPlus className="h-3.5 w-3.5" />
        حفظ البحث
      </Button>

      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent className="flex flex-col gap-4 p-4">
          <SheetHeader>
            <SheetTitle>حفظ البحث الحالي</SheetTitle>
          </SheetHeader>
          <p className="text-xs text-muted-foreground">
            سنُعلمك عند ظهور نتائج جديدة مطابقة (حسب إعدادات الإشعارات).
          </p>
          <div className="space-y-1.5">
            <label htmlFor="saved-label" className="text-xs font-medium">
              اسم البحث
            </label>
            <Input
              id="saved-label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={80}
              placeholder="مثال: جوالات مستعملة في غزة"
            />
          </div>
          {error && <p className="text-xs text-destructive">{error}</p>}
          <Button
            type="button"
            className="h-11 w-full rounded-xl"
            disabled={saving}
            onClick={() => void handleSave()}
          >
            {saving ? <><Spinner size="sm" /><span>جارٍ الحفظ…</span></> : 'حفظ'}
          </Button>
        </SheetContent>
      </Sheet>
    </>
  );
}
