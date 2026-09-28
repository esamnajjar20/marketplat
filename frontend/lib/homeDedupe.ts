/**
 * Cross-section de-duplication for the homepage.
 *
 * The same ad / product / store can legitimately appear in the featured
 * carousel and again in a "latest" rail. Showing it twice wastes the fold, so
 * rails drop items already shown higher up.
 *
 * Small marketplaces have few items: if removing duplicates would leave a rail
 * nearly empty (or empty — which would read as "no ads yet"), the original
 * list is kept instead. A duplicate is better than a misleading empty state.
 */

type WithId = { id: string };

const DEFAULT_MIN_KEPT = 3;

export function collectIds(...lists: Array<ReadonlyArray<WithId> | null | undefined>): Set<string> {
  const ids = new Set<string>();
  for (const list of lists) {
    if (!list) continue;
    for (const item of list) ids.add(item.id);
  }
  return ids;
}

export function dedupeKeepingMin<T extends WithId>(
  items: readonly T[],
  exclude: ReadonlySet<string>,
  minKept: number = DEFAULT_MIN_KEPT,
): T[] {
  if (exclude.size === 0) return [...items];
  const filtered = items.filter((item) => !exclude.has(item.id));
  return filtered.length >= Math.min(minKept, items.length) ? filtered : [...items];
}
