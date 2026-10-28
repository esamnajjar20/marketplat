/** Shared visual tokens for public product, ad, service and request detail pages.
 * Aligned with the 2025 design mockups (warm palette, 16px cards, soft elevation).
 */
export const DETAIL_GALLERY_SHELL =
  'overflow-hidden rounded-2xl border border-[#EAE3D6] bg-card shadow-[0_1px_3px_rgba(42,36,29,0.06)]';

export const DETAIL_GALLERY_FRAME =
  'relative aspect-[4/3] bg-muted touch-pan-y sm:aspect-[16/9]';

export const DETAIL_PANEL =
  'rounded-2xl border border-[#EAE3D6] bg-card shadow-[0_1px_3px_rgba(42,36,29,0.06)]';

export const DETAIL_PANEL_PADDED = `${DETAIL_PANEL} p-3.5 sm:p-4`;

export const DETAIL_SECTION_TITLE =
  'text-[15px] font-extrabold tracking-tight text-foreground';

export const DETAIL_META_TILE =
  'rounded-xl border border-[#EAE3D6]/60 bg-[#F6F1E7]/80 p-3 sm:p-4';

export const DETAIL_THUMBNAIL_RAIL =
  'flex gap-2 overflow-x-auto border-t border-[#EAE3D6] p-3';

export const DETAIL_PRICE_PANEL =
  `${DETAIL_PANEL} space-y-3 p-3.5 sm:p-4`;

/** Status / availability tags matching the design system */
export const TAG_BASE =
  'inline-flex items-center gap-1 h-6 px-2.5 rounded-full text-[11px] font-bold whitespace-nowrap';

export const TAG_AVAILABLE = `${TAG_BASE} bg-[#E8F1EC] text-[#1F4D33]`;
export const TAG_LIMITED = `${TAG_BASE} bg-[#FBF0D9] text-[#7A4B07]`;
export const TAG_OUT = `${TAG_BASE} bg-[#FBE9E7] text-[#9B2118]`;
export const TAG_SERVICE = `${TAG_BASE} bg-[#E8F1EC] text-[#1F4D33]`;
export const TAG_WARNING = `${TAG_BASE} bg-[#FBF0D9] text-[#7A4B07]`;
export const TAG_MUTED = `${TAG_BASE} bg-[#F6F1E7] text-[#4A433A]`;

/** Primary CTA button style from mockups */
export const BTN_PRIMARY =
  'h-11 px-4 rounded-xl border-0 bg-[#397F56] text-white text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-[#326f4b] transition-colors';

export const BTN_OUTLINE =
  'h-11 px-4 rounded-xl bg-white text-[#1F4D33] border border-[#CFE0D5] text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-[#E8F1EC]/50 transition-colors';

export const BTN_DANGER =
  'h-11 px-4 rounded-xl bg-white text-[#9B2118] border border-[#F1C9C4] text-sm font-bold flex items-center justify-center gap-1.5 hover:bg-[#FBE9E7]/50 transition-colors';

export const STICKY_BAR =
  'fixed inset-x-0 bottom-0 z-40 border-t border-[#EAE3D6] bg-white/95 backdrop-blur-sm px-4 py-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))] flex items-center gap-2.5';
