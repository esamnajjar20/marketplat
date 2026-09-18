/**
 * bulkRunner.ts — BULK-ADMIN (item 17).
 *
 * Shared best-effort batch runner for admin bulk actions (reports,
 * ads, users, sellers, stores). Runs an existing single-item service
 * function once per id via Promise.allSettled — deliberately NOT a
 * $transaction, because one bad/already-actioned id must not roll
 * back the rest of a legitimate batch (see reports.repository.ts's
 * updateManyStatus, the original implementation this was extracted
 * from).
 *
 * Calling the real per-item *service* function (not a repository
 * updateMany) is the point: every existing single-row endpoint
 * (setAdFeatured, toggleUserActive, setVerification, ...) already
 * carries its own authorization checks (rank rules, self-action
 * guards, last-admin-standing guards), audit logging, and cache
 * invalidation. Running the batch through those same functions means
 * a bulk call can never bypass a check a single call would have
 * enforced — there is exactly one authorization path per action, not
 * a duplicated/divergent one for the bulk case.
 */

import { BadRequestError } from '../errors/BadRequestError';

// Upper bound on how many ids a single bulk call may carry. Three
// admin controllers (admin / sellers / stores) call runBulk with
// ids straight from the request body — nothing in the runner itself
// previously bounded the array, so a direct API call (bypassing the
// UI's own selection cap) could submit thousands of ids and fire
// that many concurrent DB writes, exhausting the Prisma connection
// pool and wedging the worker for other tenants. 500 is generous for
// any realistic "select all on this page" batch while bounding the
// damage a hostile or malformed request can do.
export const BULK_MAX_IDS = 500;

// Max number of action() calls actually in flight at once. The
// previous implementation did Promise.allSettled(ids.map(action)) —
// full parallelism, which for a 500-id batch means 500 simultaneous
// DB round trips. Processing in sequential chunks of this size keeps
// order-independent parallel throughput for small/medium batches
// while capping peak load for the large end of the range. 10 matches
// the same magnitude used elsewhere in this codebase for
// "concurrent DB writers" (e.g. the image-upload helper's per-call
// upload concurrency).
export const BULK_CONCURRENCY = 10;

export interface BulkFailure {
  id: string;
  reason: string;
}

export interface BulkResult<T> {
  updated: T[];
  failed: BulkFailure[];
}

/**
 * runBulk — calls `action(id)` for every id in `ids`, collecting
 * successes and failures independently. A thrown AppError's own
 * `.message` is used as the per-id failure reason (NotFoundError,
 * ForbiddenError, BadRequestError, etc. all already carry a
 * human-readable message meant for exactly this); any other thrown
 * value falls back to a generic message rather than leaking an
 * internal error's shape to the client.
 */
export async function runBulk<T>(
  ids: string[],
  action: (id: string) => Promise<T>
): Promise<BulkResult<T>> {
  if (ids.length > BULK_MAX_IDS) {
    throw new BadRequestError(
      `Cannot process more than ${BULK_MAX_IDS} items in a single bulk request (received ${ids.length}).`,
    );
  }

  // Process in sequential chunks of BULK_CONCURRENCY, preserving
  // per-id result order: each chunk's Promise.allSettled resolves
  // before the next chunk starts, and we push results as we go — so
  // `results[i]` still corresponds to `ids[i]`, exactly as the
  // original single-allSettled implementation guaranteed.
  const results: PromiseSettledResult<T>[] = [];
  for (let i = 0; i < ids.length; i += BULK_CONCURRENCY) {
    const chunk = ids.slice(i, i + BULK_CONCURRENCY);
    const chunkResults = await Promise.allSettled(chunk.map((id) => action(id)));
    results.push(...chunkResults);
  }

  const updated: T[] = [];
  const failed: BulkFailure[] = [];

  results.forEach((result, index) => {
    const id = ids[index];
    if (result.status === 'fulfilled') {
      updated.push(result.value);
    } else {
      const err = result.reason;
      const reason = err instanceof Error ? err.message : 'Update failed';
      failed.push({ id, reason });
    }
  });

  return { updated, failed };
}
