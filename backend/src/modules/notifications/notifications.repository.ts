import { prisma } from '../../config/prisma';
import { Prisma, Notification, NotificationType } from '@prisma/client';
import { getPaginationParams } from '../../shared/utils/pagination';

export interface CreateNotificationInput {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  data?: Prisma.InputJsonValue;
}

export const notificationsRepository = {
  create: (input: CreateNotificationInput): Promise<Notification> =>
    prisma.notification.create({ data: input }),

  /** Fan-out create for a broadcast (admin promotion) or a price-change
   * alert reaching every favoriter of one ad — createMany is a single
   * round trip instead of N sequential creates. Prisma's createMany
   * doesn't return the created rows (fine here: nothing reads them back
   * immediately after a broadcast). */
  createMany: (inputs: CreateNotificationInput[]): Promise<Prisma.BatchPayload> =>
    prisma.notification.createMany({ data: inputs }),

  findManyForUser: async (
    userId: string,
    query: { page?: number; limit?: number; unreadOnly?: boolean }
  ): Promise<{ notifications: Notification[]; total: number }> => {
    const { page = 1, limit = 20, unreadOnly = false } = query;
    const { skip, take } = getPaginationParams(page, limit);
    const where: Prisma.NotificationWhereInput = {
      userId,
      ...(unreadOnly ? { readAt: null } : {}),
    };

    const [notifications, total] = await Promise.all([
      prisma.notification.findMany({ where, orderBy: { createdAt: 'desc' }, skip, take }),
      prisma.notification.count({ where }),
    ]);
    return { notifications, total };
  },

  countUnreadForUser: (userId: string): Promise<number> =>
    prisma.notification.count({ where: { userId, readAt: null } }),

  /** Marks one notification read — scoped to userId so a caller can
   * never mark someone else's notification as read by guessing an id
   * (same ownership-in-the-WHERE-clause shape as
   * messagesRepository.markReadForRecipient). Returns the row count
   * actually updated: 0 means either the id doesn't exist or it isn't
   * the caller's — the service layer treats both as NotFound. */
  markRead: (id: string, userId: string): Promise<Prisma.BatchPayload> =>
    prisma.notification.updateMany({
      where: { id, userId, readAt: null },
      data: { readAt: new Date() },
    }),

  markAllRead: (userId: string): Promise<Prisma.BatchPayload> =>
    prisma.notification.updateMany({
      where: { userId, readAt: null },
      data: { readAt: new Date() },
    }),
};
