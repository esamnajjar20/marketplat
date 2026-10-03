export const CARD_SHELL = 'h-full w-full min-w-0 overflow-hidden rounded-2xl border border-border/80 bg-card shadow-sm';
export const CARD_BODY_DEFAULT = 'flex flex-1 flex-col gap-1.5 p-3.5';
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
