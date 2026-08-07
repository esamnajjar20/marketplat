import { UserActivity, UserActivityType } from '@prisma/client';
import { activityRepository, CreateActivityInput } from './activity.repository';
import { activityBuffer } from '../../shared/utils/activityBuffer';
import { logger } from '../../shared/utils/logger';
import { buildPaginationMeta } from '../../shared/utils/pagination';
import { PaginatedResult } from '../../shared/types/pagination.types';
import { ActivityGroup, GetMyActivityQuery } from './activity.validation';

// Gap #10: maps each of the frontend's 8 filter tabs onto the concrete
// UserActivityType values it covers. Kept here (not in validation.ts,
// which only owns the group *names*) since this is the one place that
// needs to know both "what a group means" and "what types exist" —
// activity.repository.ts stays ignorant of groups entirely, and
// activity.validation.ts stays ignorant of which types belong to which
// group, so a new activity type only ever needs a change in this one
// object plus its ACTIVITY_META entry below.
const GROUP_TYPES: Record<Exclude<ActivityGroup, 'ALL'>, readonly UserActivityType[]> = {
  ADS: [UserActivityType.AD_CREATED, UserActivityType.AD_UPDATED, UserActivityType.AD_DELETED],
  PRODUCTS: [
    UserActivityType.PRODUCT_CREATED,
    UserActivityType.PRODUCT_UPDATED,
    UserActivityType.PRODUCT_DELETED,
  ],
  SERVICES: [
    UserActivityType.SERVICE_CREATED,
    UserActivityType.SERVICE_UPDATED,
    UserActivityType.SERVICE_DELETED,
  ],
  STORES: [
    UserActivityType.STORE_CREATED,
    UserActivityType.STORE_UPDATED,
    UserActivityType.STORE_FOLLOWED,
    UserActivityType.STORE_UNFOLLOWED,
    // A user's own favorites live under the STORES/marketplace-object
    // umbrella in the frontend's tab bar (there's no dedicated
    // "المفضلة" tab per the task's 8-tab list) — grouped here rather
    // than invented as a 9th tab.
    UserActivityType.FAVORITE_ADDED,
    UserActivityType.FAVORITE_REMOVED,
  ],
  MESSAGES: [UserActivityType.MESSAGE_SENT],
  REQUESTS: [
    UserActivityType.SERVICE_REQUEST_CREATED,
    UserActivityType.SERVICE_REQUEST_STATUS_CHANGED,
    UserActivityType.APPOINTMENT_BOOKED,
    UserActivityType.APPOINTMENT_CANCELLED,
  ],
  ACCOUNT: [UserActivityType.PROFILE_UPDATED, UserActivityType.PASSWORD_CHANGED],
};

export const activityService = {
  /**
   * The single write path every other module's service calls through
   * to log an activity — mirrors auditLog()'s own contract exactly
   * (shared/utils/auditLog.ts): fire-and-forget, no `await`/`.catch`
   * required at any of the 36 call sites across every module.
   *
   * FIX OPS-1.1: previously wrote straight to Postgres on every call
   * (activityRepository.create per user action — ad view, page open,
   * button click). Under real traffic that's an unbounded per-action
   * INSERT rate competing with the app's own transactional writes for
   * the same connection pool. Now pushes onto activityBuffer instead,
   * which batches into Postgres via createMany() every 5s (see that
   * file's own doc comment for why 5s and not viewsBuffer's 60s).
   * activityBuffer.push() already catches and logs its own failures
   * (including its direct-write fallback if Redis itself is down), so
   * this stays a thin, non-throwing wrapper exactly as before.
   */
  record: (input: CreateActivityInput): void => {
    activityBuffer.push(input).catch((err) => {
      logger.error('Failed to write user activity', { err, userId: input.userId, type: input.type });
    });
  },

  getMyActivity: async (
    userId: string,
    query: GetMyActivityQuery
  ): Promise<PaginatedResult<UserActivity>> => {
    const groupTypes =
      query.group && query.group !== 'ALL' ? GROUP_TYPES[query.group] : undefined;
    const { activities, total } = await activityRepository.findManyForUser(
      userId,
      query,
      groupTypes
    );
    return {
      items: activities,
      meta: buildPaginationMeta(total, query.page ?? 1, query.limit ?? 20),
    };
  },
};

// Exported for unit tests only — same convention as saved-searches
// .service.ts's __testables__ export.
export const __testables__ = { GROUP_TYPES };
