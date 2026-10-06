export const CARD_SHELL = 'h-full w-full min-w-0 overflow-hidden rounded-[1.1rem] border border-border/80 bg-card shadow-sm';
export const CARD_BODY_DEFAULT = 'flex flex-1 flex-col gap-1.5 p-3';
export const CARD_BODY_COMPACT = 'flex flex-1 flex-col gap-1 p-2.5';
export const CARD_IMAGE_43 = 'relative aspect-[4/3] overflow-hidden bg-muted';
export const CARD_IMAGE_SQUARE = 'relative aspect-square overflow-hidden bg-muted';

export function freshnessClass(now: number | null, createdAt: string): string {
  if (now === null) return 'text-muted-foreground';
  const ageHours = (now - new Date(createdAt).getTime()) / 3_600_000;
  return Number.isFinite(ageHours) && ageHours < 24 ? 'text-success' : 'text-muted-foreground';
}

export const TIME_PLACEHOLDER = '\u00A0';
export const HIT_AREA = "after:absolute after:-inset-1.5 after:content-['']";

export const CARD_MAX_BADGES = 2;
export const CARD_PRESS = 'active:scale-[0.98]';
/** القاعدة 7: زر القلب — end-2 top-2، 36px، خارج الـLink. */
export const CARD_HEART_POSITION = 'absolute end-2 top-2 z-20';
export const CARD_PRICE_UNSET = 'السعر غير معلن';

/** Rule 7 + 10: heart button styles shared between AdCard and FavoriteButton variant="card". */
export const CARD_HEART_BUTTON_BASE = 'flex items-center justify-center rounded-full backdrop-blur transition-transform active:scale-90 disabled:opacity-60';
export const CARD_HEART_BUTTON_BG = 'bg-background/95 shadow-md';
export const CARD_HEART_ICON_FILLED = 'fill-rating text-rating';
export const CARD_HEART_ICON_OUTLINE = 'text-foreground/80';
