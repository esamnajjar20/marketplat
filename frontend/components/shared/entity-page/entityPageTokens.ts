/**
 * Unified layout tokens for public entity pages: Store + Profile.
 * Goal: one visual system (shell, cover, identity, stats, actions, tabs)
 * so mobile and desktop feel ordered and professional — not ad-hoc.
 *
 * ENTITY-PAGE-RESTRUCTURE (2026-11-21)
 */

/** Page container — same max width and padding for store & profile */
export const ENTITY_PAGE =
  'container mx-auto w-full max-w-6xl space-y-5 px-3 py-5 sm:space-y-6 sm:px-4 lg:space-y-8 lg:py-8';

/** Outer card wrapping the header block */
export const ENTITY_SHELL =
  'relative isolate overflow-hidden rounded-3xl border border-border/70 bg-background shadow-sm';

/** Soft gradient band when there is no cover image (profile / fallback) */
export const ENTITY_BAND =
  'absolute inset-x-0 top-0 h-[112px] rounded-b-[28px] bg-gradient-to-br from-primary-soft via-primary-soft/80 to-accent-soft sm:h-[120px]';

/** Cover image frame (stores) */
export const ENTITY_COVER =
  'relative h-[160px] w-full overflow-hidden rounded-b-[28px] bg-muted sm:h-52 md:h-56 lg:h-64';

/** Body under cover / band */
export const ENTITY_BODY = 'relative z-10 px-4 pb-5 pt-0 sm:px-5 lg:px-8 lg:pb-8';

/**
 * Desktop: identity column (start) + stats/actions column (end).
 * Mobile: single stacked column, centered identity.
 */
export const ENTITY_GRID =
  'flex flex-col gap-5 lg:flex-row lg:items-start lg:gap-10';

export const ENTITY_IDENTITY =
  'flex w-full flex-col items-center text-center lg:w-[280px] lg:shrink-0 lg:items-start lg:text-start';

export const ENTITY_SIDE =
  'flex w-full min-w-0 flex-1 flex-col gap-3.5 lg:pt-2';

/** Stats strip — 3 equal tiles */
export const ENTITY_STATS =
  'flex gap-2 rounded-2xl border border-border bg-card p-2 shadow-sm';

export const ENTITY_STAT_TILE =
  'flex flex-1 flex-col items-center gap-0.5 rounded-xl bg-surface-2 px-1 py-3 transition-colors';

export const ENTITY_STAT_VALUE =
  'text-[18px] font-extrabold leading-tight tabular-nums text-foreground sm:text-[19px]';

export const ENTITY_STAT_LABEL = 'text-[11px] text-muted-foreground sm:text-xs';

/** Primary action row (follow / call / message) */
export const ENTITY_ACTIONS_PRIMARY =
  'flex flex-wrap gap-2';

export const ENTITY_ACTION_PRIMARY_BTN =
  'h-11 min-h-11 flex-1 gap-2 rounded-xl text-sm font-bold sm:flex-[1.3]';

export const ENTITY_ACTION_OUTLINE =
  'inline-flex h-11 min-h-11 flex-1 items-center justify-center gap-2 rounded-xl border-[1.5px] border-primary/25 bg-card text-sm font-bold text-primary transition hover:bg-primary-soft active:scale-[0.98]';

/** Secondary tools row (whatsapp, offline, catalog, report…) */
export const ENTITY_ACTIONS_SECONDARY =
  'flex flex-wrap items-center gap-2 border-t border-border/60 pt-3';

/** Meta block: hours, map, payment — quieter secondary zone */
export const ENTITY_META =
  'space-y-2.5 border-t border-border/60 pt-3';

/** Owner / self tools — highlighted but separated */
export const ENTITY_OWNER_PANEL =
  'space-y-3 rounded-2xl border border-primary/15 bg-primary/[0.035] p-3 sm:p-4';

/**
 * Sticky tab bar shared by store storefront + profile tabs.
 * Clears public header; horizontal scroll on mobile.
 */
export const ENTITY_TABLIST =
  'sticky top-[var(--protected-header-offset,3.5rem)] z-20 -mx-1 flex gap-1 overflow-x-auto overscroll-x-contain border-b border-border bg-background/95 px-1 scrollbar-thin backdrop-blur supports-[backdrop-filter]:bg-background/90 sm:mx-0';

export const ENTITY_TAB_BTN =
  'h-12 shrink-0 whitespace-nowrap border-b-[3px] px-3.5 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1';

export const ENTITY_TAB_ACTIVE =
  'border-primary font-extrabold text-primary';

export const ENTITY_TAB_IDLE =
  'border-transparent font-semibold text-muted-foreground hover:text-foreground';

/** Content panel under tabs */
export const ENTITY_TAB_PANEL = 'min-h-[12rem] pt-4 sm:pt-5';
