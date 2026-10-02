import type { AdListItem } from '@/types/ad.types';
import type { ProductWithStore } from '@/types/product.types';
import type { ServiceListingWithProvider } from '@/types/service.types';

/**
 * "مخصص لك" feed builder — pure (no React), shared by the home rail and the
 * /suggestions page.
 *
 * Inputs per type:
 *   - `ranked`   : the recommendation endpoint's list, already in the server's
 *                  priority order (interest/category weight + city, then a
 *                  trending backfill). Position in this list IS the priority.
 *   - `fallback` : organic recent items, only used after every ranked item.
 *
 * Ordering rules:
 *   1. Tier first   — every ranked item of every type comes before any
 *                     fallback item (interest beats recency).
 *   2. Rank next    — within a tier, rank 0 of each type, then rank 1 of each…
 *                     so the best ad / product / service are all near the top.
 *   3. Mix guard    — while at least two types have content, no type may take
 *                     more than `maxShare` of the output, nor more cards than
 *                     can be separated into runs of `maxRun` by the other
 *                     types. The guard is lifted only to reach `minCards`.
 *   4. Display      — chosen cards are laid out proportionally per type (a
 *                     scarce type is spread out, not front-loaded), never more
 *                     than `maxRun` of one type in a row, each type keeping
 *                     its own priority order.
 *
 * Limitation: the API gives no cross-type score, so "priority" across types is
 * rank-parity (best of each type first), not a true global score.
 */

export type ForYouKind = 'ad' | 'product' | 'service';

export type ForYouItem =
  | { kind: 'ad'; data: AdListItem }
  | { kind: 'product'; data: ProductWithStore }
  | { kind: 'service'; data: ServiceListingWithProvider };

export interface ForYouSource<T> {
  ranked?: readonly T[] | null;
  fallback?: readonly T[] | null;
}

export interface ForYouSources {
  ad: ForYouSource<AdListItem>;
  product: ForYouSource<ProductWithStore>;
  service: ForYouSource<ServiceListingWithProvider>;
}

export interface BuildForYouOptions {
  /** Max cards returned. */
  limit: number;
  /** Max fraction of `limit` one type may take (default 0.5). */
  maxShare?: number;
  /** Below this many cards the share cap is lifted so the rail isn't sparse (default 6). */
  minCards?: number;
  /** Max consecutive cards of one type (default 2). */
  maxRun?: number;
}

const KINDS: readonly ForYouKind[] = ['ad', 'product', 'service'];

interface Candidate {
  item: ForYouItem;
  tier: 0 | 1;
  rank: number;
  order: number;
}

function toArray<T>(value: readonly T[] | null | undefined): readonly T[] {
  return Array.isArray(value) ? value : [];
}

function collect(sources: ForYouSources): Candidate[] {
  const out: Candidate[] = [];

  KINDS.forEach((kind, order) => {
    const src = sources[kind] as ForYouSource<{ id: string }>;
    const seen = new Set<string>();
    const tiers: Array<[0 | 1, readonly { id: string }[]]> = [
      [0, toArray(src.ranked)],
      [1, toArray(src.fallback)],
    ];

    for (const [tier, list] of tiers) {
      let rank = 0;
      for (const data of list) {
        if (!data?.id || seen.has(data.id)) continue;
        seen.add(data.id);
        out.push({ item: { kind, data } as ForYouItem, tier, rank, order });
        rank += 1;
      }
    }
  });

  return out;
}

/**
 * Lay out the chosen cards: each step takes the type that is furthest behind
 * its proportional share (ties → ad, product, service), skipping a type that
 * already ran `maxRun` times. Per-type priority order is preserved.
 */
function layout(picked: ForYouItem[], maxRun: number): ForYouItem[] {
  const queues: Record<ForYouKind, ForYouItem[]> = { ad: [], product: [], service: [] };
  for (const item of picked) queues[item.kind].push(item);

  const totals: Record<ForYouKind, number> = {
    ad: queues.ad.length,
    product: queues.product.length,
    service: queues.service.length,
  };
  const taken: Record<ForYouKind, number> = { ad: 0, product: 0, service: 0 };
  const out: ForYouItem[] = [];
  let run = 0;

  while (out.length < picked.length) {
    const lastKind = out[out.length - 1]?.kind;
    let best: ForYouKind | null = null;
    let bestProgress = Infinity;

    for (const kind of KINDS) {
      if (taken[kind] >= totals[kind]) continue;
      if (kind === lastKind && run >= maxRun) continue;
      const progress = (taken[kind] + 0.5) / totals[kind];
      if (progress < bestProgress) {
        best = kind;
        bestProgress = progress;
      }
    }

    // Only one type left (run limit can't be honoured) → just drain it.
    if (!best) best = KINDS.find((k) => taken[k] < totals[k]) ?? null;
    if (!best) break;

    const next = queues[best][taken[best]];
    if (!next) break;
    taken[best] += 1;
    run = best === lastKind ? run + 1 : 1;
    out.push(next);
  }

  return out;
}

export function buildForYouFeed(
  sources: ForYouSources,
  { limit, maxShare = 0.5, minCards = 6, maxRun = 2 }: BuildForYouOptions,
): ForYouItem[] {
  if (limit <= 0) return [];

  const sorted = collect(sources).sort(
    (a, b) => a.tier - b.tier || a.rank - b.rank || a.order - b.order,
  );

  const available = new Set(sorted.map((c) => c.item.kind));
  // Nothing to mix with: show the best `limit` cards of the one type there is.
  if (available.size < 2) {
    return sorted.slice(0, limit).map((c) => c.item);
  }

  const cap = Math.max(1, Math.ceil(limit * maxShare));
  const counts: Record<ForYouKind, number> = { ad: 0, product: 0, service: 0 };
  const picked: ForYouItem[] = [];
  const held: ForYouItem[] = []; // good cards the mix guard kept out, in priority order

  for (const { item } of sorted) {
    if (picked.length >= limit) break;
    if (counts[item.kind] >= cap) {
      held.push(item);
      continue;
    }
    picked.push(item);
    counts[item.kind] += 1;
  }

  // A type can only be separated into runs of `maxRun` by the other types'
  // cards; trim its lowest-priority surplus instead of ending with a wall of it.
  const trimmed = new Set<ForYouItem>();
  for (const kind of KINDS) {
    const others = picked.length - counts[kind];
    let surplus = counts[kind] - maxRun * others;
    for (let i = picked.length - 1; i >= 0 && surplus > 0; i -= 1) {
      const item = picked[i]!;
      if (item.kind !== kind) continue;
      trimmed.add(item);
      held.unshift(item);
      surplus -= 1;
    }
  }
  const kept = picked.filter((item) => !trimmed.has(item));

  // Sparse market: lift the guard just enough to reach the floor.
  const floor = Math.min(minCards, limit);
  for (const item of held) {
    if (kept.length >= floor) break;
    kept.push(item);
  }

  return layout(kept, maxRun);
}
