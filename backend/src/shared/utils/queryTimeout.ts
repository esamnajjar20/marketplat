import { Prisma, PrismaClient } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { AppError } from '../errors/AppError';

/**
 * AUDIT-FIX 1.3: analytics.repository.ts's raw aggregate queries
 * (trendByEvent, topCategories) had no timeout anywhere — the app-level
 * PrismaClient in prisma.ts sets none, and there is no other general
 * statement_timeout configured for this codebase (checked: no
 * PGOPTIONS/options= in DATABASE_URL handling, no pool-level default).
 * A wide enough admin-selected date range could hold a Postgres
 * connection (and, under load, the whole pool) indefinitely.
 *
 * SET LOCAL statement_timeout scopes the timeout to the current
 * transaction only — it resets automatically at COMMIT/ROLLBACK — so
 * this affects only the query it wraps, never the app's default
 * session behavior. That's why this is a short prisma.$transaction
 * wrapper rather than a global Prisma Client config: it lets these two
 * specific, potentially-heavy analytics queries opt into a tight bound
 * without changing timeout behavior for every other query in the app.
 *
 * SQLSTATE 57014 is Postgres's "query_canceled" error, raised when
 * statement_timeout fires. Checked via error.meta?.code (matches how
 * Prisma surfaces the underlying SQLSTATE for a raw query cancellation
 * under P2010 — see the Prisma docs for "Raw query failed") with a
 * message-substring fallback, since relying on meta.code alone assumes
 * Prisma's error-shape mapping here is exactly this literal — being
 * defensive costs nothing and avoids a raw, unexplained Postgres error
 * reaching the client if that mapping ever shifts.
 */
export class AnalyticsQueryTimeoutError extends AppError {
  constructor() {
    super(
      'This report took too long to generate — try a narrower date range',
      503,
      'ANALYTICS_QUERY_TIMEOUT'
    );
  }
}

const isQueryCanceledError = (error: unknown): boolean => {
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.meta?.code === '57014') return true;
    if (typeof error.message === 'string' && error.message.includes('57014')) return true;
    if (typeof error.message === 'string' && error.message.toLowerCase().includes('query_canceled')) {
      return true;
    }
  }
  return false;
};

/**
 * Runs `fn` (expected to issue one or more prisma.$queryRaw calls)
 * inside a transaction with a local statement_timeout, translating a
 * timeout cancellation into a clear AnalyticsQueryTimeoutError instead
 * of letting Postgres's raw cancellation error reach the caller.
 */
export const runWithQueryTimeout = async <T>(
  fn: (tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>) => Promise<T>,
  timeoutMs: number = 10_000
): Promise<T> => {
  // Defense in depth for the string interpolation below: SET LOCAL
  // does not accept a bound parameter placeholder ($1) the way a
  // normal query does (it's DDL-adjacent session config, not a DML
  // statement), so this has to be interpolated as literal SQL text.
  // Guarding that the value is actually a safe integer here — not just
  // trusting every call site to only ever pass an env-sourced number —
  // means this function can never become an injection vector even if a
  // future caller passes a less-trusted value.
  const safeTimeoutMs = Number.isFinite(timeoutMs) ? Math.max(0, Math.trunc(timeoutMs)) : 10_000;

  try {
    return await prisma.$transaction(async tx => {
      await tx.$executeRawUnsafe(`SET LOCAL statement_timeout = ${safeTimeoutMs}`);
      return fn(tx);
    });
  } catch (error) {
    if (isQueryCanceledError(error)) {
      throw new AnalyticsQueryTimeoutError();
    }
    throw error;
  }
};
