'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { useIsEntityFavorited, useFavoriteEntityCheck } from '@/hooks/queries/useFavorites';
import { useToggleFavoriteEntity } from '@/hooks/mutations/useFavoriteMutations';
import type { FavoriteEntityKind } from '@/types/favorite.types';
import { CARD_HEART_BUTTON_BASE, CARD_HEART_BUTTON_BG, CARD_HEART_ICON_FILLED, CARD_HEART_ICON_OUTLINE } from '@/components/shared/cards/cardTokens';

interface Props {
  entityType: FavoriteEntityKind;
  entityId: string;
  className?: string;
  size?: 'sm' | 'md';
  /**
   * When true, warms/refreshes this one entity's status via GET
   * /favorites/:segment/:entityId/check on mount — for single-entity
   * views (StoreHeader, ServiceListingDetail), same reasoning as
   * AdDetailSection's useFavoriteCheck(id). Leave false (default) in
   * card grids (ProductCard, StoreCard, ServiceListingCard) — one
   * check request per visible card would be a real regression; those
   * rely on the shared entityIds(type) Set already being warmed by
   * whichever list/detail view the user visited.
   */
  warm?: boolean;
  /** زر بنص مثل الإعلانات */
  showLabel?: boolean;
  /** نمط البطاقات (القاعدة 7): مفرّغ/ممتلئ بلون rating، 36px. */
  variant?: 'default' | 'card';
}

/**
 * FEAT-FAVORITE-POLYMORPHIC PR3: entity-agnostic favorite (heart)
 * button — same interaction/visual contract as AdCard.tsx's inline
 * heart button (optimistic toggle, heart-pop animation on add only,
 * auth gate with a toast, disabled while pending to prevent duplicate
 * requests), factored out so Product/Store/Service each get it without
 * three near-identical copies of the same button.
 */
const ADD_LABEL = 'إضافة إلى المفضلة';
const REMOVE_LABEL = 'إزالة من المفضلة';

export function FavoriteButton({ entityType, entityId, className, size = 'md', warm = false, showLabel = false, variant = 'default' }: Props) {
  const isAuth = useAuthStore(selectIsAuthenticated);
  // Rules-of-hooks: always called, `warm` just gates the network
  // request internally (see useFavoriteEntityCheck's own doc comment).
  useFavoriteEntityCheck(entityType, entityId, warm);
  const isFavorited = useIsEntityFavorited(entityType, entityId);
  const toggleFavorite = useToggleFavoriteEntity(entityType);
  // Offline taps persist a desired-state intent locally and sync when online.
  const isCard = variant === 'card';

  const [popKey, setPopKey] = useState(0);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    // matches AdCard's own heart-button fix
    // () — a bare toast left the user on the same
    // page with no path to sign in. Redirect to /login with the current
    // page as `from` so they land back here after signing in.
    if (!isAuth) {
      toast.error('سجّل الدخول لحفظ العنصر');
      if (typeof window !== 'undefined') {
        const returnTo = window.location.pathname + window.location.search;
        window.location.href = `/login?from=${encodeURIComponent(returnTo)}`;
      }
      return;
    }
    if (toggleFavorite.isPending) return; // avoid duplicate taps while the mutation is running
    if (!isFavorited) setPopKey((k) => k + 1);
    toggleFavorite.mutate(entityId);
  }


  const textLabel = isFavorited ? REMOVE_LABEL : ADD_LABEL;


  const dim = isCard ? 'h-9 w-9' : size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const iconDim = isCard ? 'h-4 w-4' : size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  if (showLabel) {
    return (
      <button
        type="button"
        onClick={handleClick}
        disabled={toggleFavorite.isPending}
        aria-label={textLabel}
        aria-pressed={isFavorited}
        className={cn(
          'inline-flex min-h-10 items-center justify-center gap-2 rounded-xl border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted disabled:opacity-60',
          isFavorited && 'border-destructive/30 text-destructive',
          className,
        )}
      >
        <Heart
          key={popKey}
          className={cn(
            'h-4 w-4',
            popKey > 0 && 'motion-safe:animate-heart-pop',
            isFavorited ? 'fill-destructive text-destructive' : 'text-foreground',
          )}
        />
        {textLabel}
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={toggleFavorite.isPending}
      aria-label={textLabel}
      aria-pressed={isFavorited}
      title={textLabel}
      className={cn(
        CARD_HEART_BUTTON_BASE,
        isCard ? CARD_HEART_BUTTON_BG : 'bg-background/90 shadow-sm',
        dim,
        className,
      )}
    >
      <Heart
        key={popKey}
        className={cn(
          iconDim,
          popKey > 0 && 'motion-safe:animate-heart-pop',
          isFavorited
            ? isCard ? CARD_HEART_ICON_FILLED : 'fill-destructive text-destructive'
            : isCard ? CARD_HEART_ICON_OUTLINE : 'text-foreground',
        )}
      />
    </button>
  );
}
