/**
 * Shared card density for list rails and browse grids (UI-PHASE-A).
 * - default: full list/grid cards
 * - compact: homepage horizontal rails (shorter image, tighter type)
 */
export type CardDensity = 'default' | 'compact';

export function isCompactDensity(density: CardDensity | undefined): boolean {
  return density === 'compact';
}
