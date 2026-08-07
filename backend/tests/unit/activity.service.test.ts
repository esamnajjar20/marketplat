import { UserActivityType } from '@prisma/client';
import { activityService, __testables__ } from '../../src/modules/activity/activity.service';
import { activityRepository } from '../../src/modules/activity/activity.repository';
import { activityBuffer } from '../../src/shared/utils/activityBuffer';
import { logger } from '../../src/shared/utils/logger';

jest.mock('../../src/modules/activity/activity.repository');
jest.mock('../../src/shared/utils/activityBuffer');
jest.mock('../../src/shared/utils/logger', () => ({
  logger: { error: jest.fn(), warn: jest.fn(), info: jest.fn() },
}));

const { GROUP_TYPES } = __testables__;

describe('activityService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('record', () => {
    const input = {
      userId: 'user-1',
      type: UserActivityType.AD_CREATED,
      title: 'تم نشر إعلان جديد',
      description: 'iPhone 13',
    };

    it('calls activityBuffer.push with the given input (buffered, not a direct DB write)', () => {
      (activityBuffer.push as jest.Mock).mockResolvedValue(undefined);

      activityService.record(input);

      expect(activityBuffer.push).toHaveBeenCalledWith(input);
      // FIX OPS-1.1: record() no longer writes to the repository
      // directly — activityBuffer.push() owns getting the row into
      // Postgres (batched), so the old direct-create call site is gone.
      expect(activityRepository.create).not.toHaveBeenCalled();
    });

    it('does not throw synchronously and returns void (fire-and-forget)', () => {
      (activityBuffer.push as jest.Mock).mockResolvedValue(undefined);

      expect(() => activityService.record(input)).not.toThrow();
      expect(activityService.record(input)).toBeUndefined();
    });

    it('swallows a buffer-push rejection and logs it instead of throwing/rejecting', async () => {
      const err = new Error('Redis down');
      (activityBuffer.push as jest.Mock).mockRejectedValue(err);

      // Must not throw synchronously, and must not produce an unhandled
      // rejection — the whole point of record()'s fire-and-forget contract.
      expect(() => activityService.record(input)).not.toThrow();

      // Let the microtask queue flush so the internal .catch() runs.
      await new Promise((resolve) => setImmediate(resolve));

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to write user activity',
        expect.objectContaining({ err, userId: input.userId, type: input.type })
      );
    });

    it('does NOT require the caller to await or .catch the call for a failure to be handled', async () => {
      (activityBuffer.push as jest.Mock).mockRejectedValue(new Error('boom'));

      // Deliberately called with no await/catch at the call site, exactly
      // as every real caller (ads.service.ts etc.) does.
      activityService.record(input);

      await new Promise((resolve) => setImmediate(resolve));

      expect(logger.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('getMyActivity', () => {
    const baseQuery = {};

    it('delegates to the repository with no groupTypes when group is omitted', async () => {
      (activityRepository.findManyForUser as jest.Mock).mockResolvedValue({
        activities: [],
        total: 0,
      });

      await activityService.getMyActivity('user-1', baseQuery);

      expect(activityRepository.findManyForUser).toHaveBeenCalledWith(
        'user-1',
        baseQuery,
        undefined
      );
    });

    it('delegates to the repository with no groupTypes when group is ALL', async () => {
      (activityRepository.findManyForUser as jest.Mock).mockResolvedValue({
        activities: [],
        total: 0,
      });

      await activityService.getMyActivity('user-1', { group: 'ALL' } as any);

      expect(activityRepository.findManyForUser).toHaveBeenCalledWith(
        'user-1',
        { group: 'ALL' },
        undefined
      );
    });

    it('resolves a non-ALL group to its concrete GROUP_TYPES list', async () => {
      (activityRepository.findManyForUser as jest.Mock).mockResolvedValue({
        activities: [],
        total: 0,
      });

      await activityService.getMyActivity('user-1', { group: 'ADS' } as any);

      expect(activityRepository.findManyForUser).toHaveBeenCalledWith(
        'user-1',
        { group: 'ADS' },
        GROUP_TYPES.ADS
      );
    });

    it('returns items mapped from activities and pagination meta built from total/page/limit', async () => {
      const activities = [{ id: 'act-1' }, { id: 'act-2' }];
      (activityRepository.findManyForUser as jest.Mock).mockResolvedValue({
        activities,
        total: 42,
      });

      const result = await activityService.getMyActivity('user-1', { page: 2, limit: 10 } as any);

      expect(result.items).toEqual(activities);
      expect(result.meta).toEqual(
        expect.objectContaining({ total: 42, page: 2, limit: 10, totalPages: 5 })
      );
    });

    it('defaults page/limit to 1/20 in the pagination meta when not provided', async () => {
      (activityRepository.findManyForUser as jest.Mock).mockResolvedValue({
        activities: [],
        total: 0,
      });

      const result = await activityService.getMyActivity('user-1', {});

      expect(result.meta).toEqual(
        expect.objectContaining({ page: 1, limit: 20 })
      );
    });
  });

  describe('GROUP_TYPES (unit)', () => {
    it('covers every ActivityGroup other than ALL', () => {
      expect(Object.keys(GROUP_TYPES).sort()).toEqual(
        ['ACCOUNT', 'ADS', 'MESSAGES', 'PRODUCTS', 'REQUESTS', 'SERVICES', 'STORES'].sort()
      );
    });

    it('groups favorites under STORES, not a dedicated tab', () => {
      expect(GROUP_TYPES.STORES).toEqual(
        expect.arrayContaining([
          UserActivityType.FAVORITE_ADDED,
          UserActivityType.FAVORITE_REMOVED,
        ])
      );
    });

    it('every UserActivityType enum value appears in exactly one group', () => {
      const allGroupedTypes = Object.values(GROUP_TYPES).flat();
      const allEnumValues = Object.values(UserActivityType);

      expect(allGroupedTypes.sort()).toEqual([...allEnumValues].sort());

      const seen = new Set<string>();
      for (const t of allGroupedTypes) {
        expect(seen.has(t)).toBe(false);
        seen.add(t);
      }
    });
  });
});
