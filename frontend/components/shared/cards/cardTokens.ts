export const CARD_SHELL =
  'h-full w-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(42,36,29,0.06)] transition-[transform,box-shadow,border-color] duration-normal ease-standard';
export const CARD_BODY_DEFAULT = 'flex flex-1 flex-col gap-1.5 p-2 sm:gap-2 sm:p-3.5';
export const CARD_BODY_COMPACT = 'flex min-w-0 flex-1 flex-col gap-1.5 p-2 sm:gap-2 sm:p-3';
export const CARD_IMAGE_43 = 'relative aspect-[4/3] overflow-hidden bg-muted';
export const CARD_IMAGE_SHADE = 'pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 via-transparent to-black/[0.03]';
export const CARD_META_ITEM = 'inline-flex min-w-0 items-center gap-1.5 rounded-full bg-muted/65 px-2 py-1';
export const CARD_PRICE_ROW = 'flex min-h-6 flex-wrap items-center gap-1 sm:min-h-7 sm:gap-1.5';
export const CARD_IMAGE_SQUARE = 'relative aspect-square overflow-hidden bg-muted';
export const CARD_IMAGE_LIST = 'relative aspect-auto h-28 w-28 shrink-0 overflow-hidden bg-muted sm:h-36 sm:w-44';

export function freshnessClass(now: number | null, createdAt: string): string {
  if (now === null) return 'text-muted-foreground';
  const ageHours = (now - new Date(createdAt).getTime()) / 3_600_000;
  return Number.isFinite(ageHours) && ageHours < 24 ? 'text-success' : 'text-muted-foreground';
}

export const TIME_PLACEHOLDER = '\u00A0';
export const HIT_AREA = "after:absolute after:-inset-1.5 after:content-['']";

export const CARD_MAX_BADGES = 2;
export const CARD_PRESS = 'active:scale-[0.995]';
export const CARD_HOVER = 'hover:-translate-y-0.5 hover:border-primary/30 hover:shadow-card-hover';
export const CARD_FOCUS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2';
export const CARD_IMAGE_HOVER = 'transition-transform duration-normal ease-standard group-hover/card:scale-[1.02]';
/** Consistent favorite position across content cards. */
export const CARD_HEART_POSITION = 'absolute end-2 top-2 z-20';
export const CARD_PRICE_UNSET = 'السعر غير معلن';

export const CARD_HEART_BUTTON_BASE = 'flex items-center justify-center rounded-full backdrop-blur transition-transform duration-fast ease-standard active:scale-90 disabled:opacity-60';
export const CARD_HEART_BUTTON_BG = 'bg-background/95 shadow-card';
export const CARD_HEART_ICON_FILLED = 'fill-rating text-rating';
export const CARD_HEART_ICON_OUTLINE = 'text-foreground/80';


/** Semantic primitives shared by every marketplace content-card family. */
export const CARD_TITLE = 'line-clamp-2 min-w-0 text-sm font-bold leading-5 text-foreground sm:text-sm sm:leading-6';
/** Grid titles reserve two lines so price/metadata rows align across mixed card content. */
export const CARD_TITLE_GRID = `${CARD_TITLE} min-h-10 sm:min-h-12`;
export const CARD_SELLER_INITIAL = 'flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-primary/15 text-[9px] font-extrabold text-primary';
export const CARD_BADGE_FEATURED = 'inline-flex h-6 items-center rounded-full bg-accent/15 px-2.5 text-[11px] font-bold text-accent-foreground';
export const CARD_BADGE_CONDITION_NEW = 'bg-success/15 text-success';
export const CARD_BADGE_CONDITION_USED = 'bg-muted text-muted-foreground';
export const CARD_MUTED_FOOTER = 'mt-auto flex min-h-5 min-w-0 flex-wrap items-center gap-1 border-t border-border/50 pt-1.5 text-[11px] text-muted-foreground sm:min-h-6 sm:gap-1.5 sm:pt-2 sm:text-xs';

/** Shared profile/service card primitives. Keep layout-specific geometry in each component. */
export const CARD_SHELL_SOFT = 'h-full min-w-0 overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(42,36,29,0.06)] transition-[box-shadow,border-color] duration-normal ease-standard';
export const CARD_AVATAR_FALLBACK = 'bg-primary/10 text-primary ring-1 ring-border/70';
export const CARD_BADGE_SUCCESS = 'inline-flex h-5 items-center gap-0.5 rounded-full bg-success/10 px-1.5 text-[10px] font-bold text-success';
export const CARD_BADGE_MUTED = 'inline-flex h-5 items-center rounded-full bg-muted px-2 text-[10px] font-bold text-muted-foreground';
export const CARD_COMPACT_ACTIONS = 'min-h-9 rounded-lg px-2.5 text-xs sm:min-h-10 sm:rounded-xl sm:px-3 sm:text-sm';


/** Shared geometry for loading placeholders so skeletons match real cards. */
export const CARD_SKELETON_SHELL = 'flex h-full min-w-0 flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[0_1px_3px_rgba(42,36,29,0.06)]';
export const CARD_SKELETON_MEDIA = 'relative aspect-[4/3] w-full overflow-hidden bg-muted';
export const CARD_SKELETON_BODY = 'flex flex-1 flex-col gap-1.5 p-2 sm:gap-2 sm:p-3.5';
export const CARD_SKELETON_BODY_COMPACT = 'flex min-w-0 flex-1 flex-col gap-1.5 p-2 sm:gap-2 sm:p-3';

/** Fixed-height skeletons for cards whose real image is a fixed height (not an aspect ratio). */
export const CARD_SKELETON_MEDIA_FIXED = 'relative h-[92px] w-full overflow-hidden bg-muted sm:h-[116px]';

/** Warning-toned badge (e.g. "expiring soon"). */
export const CARD_BADGE_WARNING = 'inline-flex h-5 items-center gap-0.5 rounded-full bg-warning/15 px-1.5 text-[10px] font-bold text-warning';
