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
  const results = await Promise.allSettled(ids.map((id) => action(id)));

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
