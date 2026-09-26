'use client';

/**
 * components/shared/SaveOfflineButton.tsx
 *
 * SAVE-ENTITY-01: unified "save for offline viewing" toggle used by
 * every public detail page (ad / product / store / seller). Reads and
 * writes through lib/offlineSavedEntities.ts so all four entity types
 * share one index and one Cache Storage bucket.
 *
 * Two visual states:
 *   - Not saved: outline button, "احفظ للعرض بدون نت" with a download
 *     icon. Clicks call saveEntityOffline.
 *   - Saved: filled button, "محفوظ" with a checkmark. Clicks call
 *     unsaveEntityOffline.
 *
 * Disabled while the request is in flight; toast on outcome. On
 * failure the state is left untouched so a second tap retries.
 */
import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Check, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/shared/ui/Button';
import { cn } from '@/lib/utils';
import { useAuthStore, selectUser } from '@/store/auth.store';
import {
  isEntitySavedOffline,
  saveEntityOffline,
  unsaveEntityOffline,
  type SavedEntityType,
} from '@/lib/offlineSavedEntities';

interface Props {
  type: SavedEntityType;
  id: string;
  title: string;
  /** price string (ads/products), or category/business type (stores/sellers). */
  subtitle?: string | null;
  city?: string | null;
  thumbnail?: string | null;
  /** every image URL the detail page renders — passed by the caller so
   *  the button doesn't have to know each entity's image shape. */
  imageUrls?: string[];
  className?: string;
  /** visual variant: 'default' (with text) | 'icon' (icon-only square). */
  variant?: 'default' | 'icon';
}

export function SaveOfflineButton({
  type,
  id,
  title,
  subtitle,
  city,
  thumbnail,
  imageUrls,
  className,
  variant = 'default',
}: Props) {
  const userId = useAuthStore(selectUser)?.id ?? null;
  const [isSaved, setIsSaved] = useState(false);
  const [isBusy, setIsBusy] = useState(false);

  useEffect(() => {
    setIsSaved(isEntitySavedOffline(type, id, userId));
  }, [type, id, userId]);

  const onClick = useCallback(async () => {
    if (isBusy) return;
    setIsBusy(true);
    try {
      if (isSaved) {
        await unsaveEntityOffline(type, id, userId);
        setIsSaved(false);
        toast.success('أُزيل من المحفوظات');
      } else {
        const ok = await saveEntityOffline(
          type,
          { id, title, subtitle, city, thumbnail, imageUrls },
          userId,
        );
        if (ok) {
          setIsSaved(true);
          toast.success('محفوظ للعرض بدون نت', {
            description: 'ستجده في «إعلانات محفوظة دون اتصال».',
          });
        } else {
          toast.error('تعذّر الحفظ — تحقق من اتصالك');
        }
      }
    } finally {
      setIsBusy(false);
    }
  }, [
    isBusy, isSaved, type, id, title, subtitle, city, thumbnail, imageUrls, userId,
  ]);

  if (variant === 'icon') {
    return (
      <button
        type="button"
        onClick={onClick}
        disabled={isBusy}
        aria-label={isSaved ? 'إزالة من المحفوظات' : 'احفظ للعرض بدون نت'}
        className={cn(
          'flex h-9 w-9 items-center justify-center rounded-full border bg-background/85 shadow-sm backdrop-blur-sm transition-colors',
          isSaved
            ? 'border-primary text-primary'
            : 'border-border text-muted-foreground hover:text-foreground',
          isBusy && 'opacity-60',
          className,
        )}
      >
        {isBusy ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isSaved ? (
          <Check className="h-4 w-4" />
        ) : (
          <Download className="h-4 w-4" />
        )}
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant={isSaved ? 'default' : 'outline'}
      onClick={onClick}
      disabled={isBusy}
      className={cn('gap-1.5', className)}
    >
      {isBusy ? (
        <Loader2 className="h-4 w-4 animate-spin" />
      ) : isSaved ? (
        <Check className="h-4 w-4" />
      ) : (
        <Download className="h-4 w-4" />
      )}
      {isSaved ? 'محفوظ' : 'احفظ للعرض بدون نت'}
    </Button>
  );
}
