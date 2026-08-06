import { Prisma, UserActivity, UserActivityType } from '@prisma/client';
import { prisma } from '../../config/prisma';
import { getPaginationParams } from '../../shared/utils/pagination';
import type { ActivityGroup } from './activity.validation';

export interface CreateActivityInput {
  userId: string;
  type: UserActivityType;
  title: string;
  description?: string;
  entityType?: string;
  entityId?: string;
  metadata?: Prisma.InputJsonValue;
}

export interface FindMyActivityQuery {
  page?: number;
  limit?: number;
  type?: UserActivityType;
  group?: ActivityGroup;
  q?: string;
}

export const activityRepository = {
  // Single write path — called only from activity.service.ts's record(),
  // never directly from another module's service. A plain create, not
  // createMany: unlike notificationsRepository's fan-out (one event ->
  // many recipient rows), an activity row always has exactly one
  // owner — the user who performed the action.
  create: (input: CreateActivityInput): Promise<UserActivity> =>
    prisma.userActivity.create({ data: input }),

  findManyForUser: async (
    userId: string,
    query: FindMyActivityQuery,
    groupTypes?: readonly UserActivityType[]
  ): Promise<{ activities: UserActivity[]; total: number }> => {
    const { page = 1, limit = 20 } = query;
    const { skip, take } = getPaginationParams(page, limit);

    // A specific `type` narrows harder than a `group`, so if both are
    // present, `type` wins outright rather than the two spreading over
    // each other unpredictably (an object literal with `type` set
    // twice would silently let whichever key comes second clobber the
    // first). groupTypes is undefined for 'ALL' (or an omitted group)
    // — the service layer resolves the group name to its concrete
    // type list before calling here, so this repository stays a thin
    // Prisma wrapper with no knowledge of what the groups mean.
    const typeFilter: Prisma.UserActivityWhereInput['type'] = query.type
      ? query.type
      : groupTypes
        ? { in: [...groupTypes] }
        : undefined;

    const where: Prisma.UserActivityWhereInput = {
      userId,
      ...(typeFilter ? { type: typeFilter } : {}),
      ...(query.q
        ? {
            OR: [
              { title: { contains: query.q, mode: 'insensitive' } },
              { description: { contains: query.q, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [activities, total] = await Promise.all([
      prisma.userActivity.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.userActivity.count({ where }),
    ]);
    return { activities, total };
  },
};
