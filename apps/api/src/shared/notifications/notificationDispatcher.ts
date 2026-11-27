import type { PrismaClient } from '@prisma/client';
import { notificationPushPayloadSchema } from '@marketplat/contracts';
import type { NotificationLifecycleRecord } from './notificationLifecycle';
import {
  publishCreatedNotifications,
  publishNotificationStateChange,
  publishNotificationStateChanges,
} from './notificationLifecycle';
import { publishDurableNotifications } from '../go-worker/publishDurableNotifications';
import { pushService, type PushPayload } from './pushService';
import type { LiveStreamEvent } from '../realtime/notificationStream';

/**
 * The single application-facing notification dispatcher. Writers keep their
 * transaction/worker ownership, then invoke these post-commit operations.
 * BullMQ/inline push and the durable Go per-device outbox remain separate
 * adapters behind this façade because they have distinct retry/delivery roles.
 */
export const notificationDispatcher = {
  publishCreated: (records: readonly NotificationLifecycleRecord[], label?: string) =>
    publishCreatedNotifications(records, label),
  publishStateChanges: (input: {
    userIds: readonly string[];
    action: Extract<LiveStreamEvent, { type: 'notification' }>['action'];
    notificationId?: string;
    changed?: boolean;
    label?: string;
  }) => publishNotificationStateChanges(input),
  publishStateChange: (input: {
    userId: string;
    action: Extract<LiveStreamEvent, { type: 'notification' }>['action'];
    notificationId?: string;
    changed?: boolean;
    label?: string;
  }) => publishNotificationStateChange(input),
  publishDurable: (prisma: PrismaClient, notificationIds: string[], label: string) =>
    publishDurableNotifications(prisma, notificationIds, label),
  pushUser: async (userId: string, payload: PushPayload) =>
    pushService.notifyUser(userId, notificationPushPayloadSchema.parse(payload)),
  pushUsers: async (userIds: string[], payload: PushPayload) =>
    pushService.notifyUsers(userIds, notificationPushPayloadSchema.parse(payload)),
};

export type { PushPayload };
