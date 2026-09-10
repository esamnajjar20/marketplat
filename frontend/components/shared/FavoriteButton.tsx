'use client';

import { useState } from 'react';
import { Heart } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useAuthStore, selectIsAuthenticated } from '@/store/auth.store';
import { useIsEntityFavorited, useFavoriteEntityCheck } from '@/hooks/queries/useFavorites';
import { useToggleFavoriteEntity } from '@/hooks/mutations/useFavoriteMutations';
import type { FavoriteEntityKind } from '@/types/favorite.types';

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

export function FavoriteButton({ entityType, entityId, className, size = 'md', warm = false, showLabel = false }: Props) {
  const isAuth = useAuthStore(selectIsAuthenticated);
  // Rules-of-hooks: always called, `warm` just gates the network
  // request internally (see useFavoriteEntityCheck's own doc comment).
  useFavoriteEntityCheck(entityType, entityId, warm);
  const isFavorited = useIsEntityFavorited(entityType, entityId);
  const toggleFavorite = useToggleFavoriteEntity(entityType);

  const [popKey, setPopKey] = useState(0);

  function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (!isAuth) { toast.error('يرجى تسجيل الدخول أولاً'); return; }
    if (toggleFavorite.isPending) return; // prevent duplicate requests
    if (!isFavorited) setPopKey((k) => k + 1);
    toggleFavorite.mutate(entityId);
  }


  const textLabel = isFavorited ? REMOVE_LABEL : ADD_LABEL;

  const dim = size === 'sm' ? 'h-7 w-7' : 'h-8 w-8';
  const iconDim = size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4';

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
        'flex items-center justify-center rounded-full bg-background/90 shadow-sm backdrop-blur-sm transition-transform active:scale-90 disabled:opacity-60',
        dim,
        className,
      )}
    >
      <Heart
        key={popKey}
        className={cn(
          iconDim,
          popKey > 0 && 'motion-safe:animate-heart-pop',
          isFavorited ? 'fill-destructive text-destructive' : 'text-foreground',
        )}
      />
    </button>
  );
}
