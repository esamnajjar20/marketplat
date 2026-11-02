/** Shared visual tokens for public product, ad, service and request detail pages.
 * Aligned with the 2025 design mockups (warm palette, 16px cards, soft elevation).
 */
export const DETAIL_GALLERY_SHELL =
  'overflow-hidden rounded-2xl border border-border bg-card shadow-xs';

export const DETAIL_GALLERY_FRAME =
  'relative aspect-[4/3] bg-muted touch-pan-y sm:aspect-[16/9]';

export const DETAIL_PANEL =
  'rounded-2xl border border-border bg-card shadow-xs';

export const DETAIL_PANEL_PADDED = `${DETAIL_PANEL} p-3.5 sm:p-4`;

export const DETAIL_SECTION_TITLE =
  'text-[15px] font-extrabold tracking-tight text-foreground';

export const DETAIL_META_TILE =
  'rounded-xl border border-border/70 bg-muted/40 p-3 sm:p-4';

export const DETAIL_THUMBNAIL_RAIL =
  'flex gap-2 overflow-x-auto border-t border-border p-3';

export const DETAIL_PRICE_PANEL =
  `${DETAIL_PANEL} space-y-3 p-3.5 sm:p-4`;

/** Status / availability tags use semantic tokens so contrast follows the active theme. */
export const TAG_BASE =
  'inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-bold whitespace-nowrap';

export const TAG_AVAILABLE = `${TAG_BASE} bg-success-soft text-success`;
export const TAG_LIMITED = `${TAG_BASE} bg-warning-soft text-warning-strong`;
export const TAG_OUT = `${TAG_BASE} bg-destructive/10 text-destructive`;
export const TAG_SERVICE = `${TAG_BASE} bg-success-soft text-success`;
export const TAG_WARNING = `${TAG_BASE} bg-warning-soft text-warning-strong`;
export const TAG_MUTED = `${TAG_BASE} bg-muted text-muted-foreground`;

/** Primary CTA button style from the active semantic palette. */
export const BTN_PRIMARY =
  'h-11 px-4 rounded-xl border-0 bg-primary text-primary-foreground text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-primary/90 transition-colors';

export const BTN_OUTLINE =
  'h-11 px-4 rounded-xl bg-background text-primary border border-border text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-muted/60 transition-colors';

export const BTN_DANGER =
  'h-11 px-4 rounded-xl bg-background text-destructive border border-destructive/30 text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-destructive/10 transition-colors';

/** Mobile action bars share the global offset that clears the bottom navigation. */
export const STICKY_BAR =
  'sticky-contact-bar flex items-center gap-2.5 border-t border-border bg-card/95 px-4 py-2.5 shadow-sm backdrop-blur';
