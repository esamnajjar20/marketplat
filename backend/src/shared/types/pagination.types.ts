import type { PaginationMeta } from '../utils/pagination';

// T620 — meta is now the same PaginationMeta interface
// buildPaginationMeta() returns, rather than a hand-inlined shape that
// silently omitted hasNextPage/hasPrevPage. The runtime already
// provided those two fields (INTEG FIX added them to
// buildPaginationMeta), but the type contract declared here didn't
// expose them — so any TS caller reading meta.hasNextPage would have
// failed to compile against a value that actually existed on the
// wire. Importing the canonical interface keeps the two in lockstep
// automatically the next time a field is added.
export interface PaginatedResult<T> {
  items: T[];
  meta: PaginationMeta;
}
