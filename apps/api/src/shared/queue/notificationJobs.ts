/**
 * Job contracts for the `notifications` queue (pure — no BullMQ import).
 *
 * BullMQ rejects custom job ids containing ':' (it is its key separator) and
 * purely numeric ids, so every id here is `<kind>_<part>_<part>`.
 */
import { createHash } from 'crypto';
import type { PushPayload } from '../utils/pushService';

export const NOTIFICATION_QUEUE_NAME = 'notifications';

export type NotificationJobName = 'fanout' | 'web' | 'fcm' | 'email-fallback';

/** Resolve a user's devices and enqueue one delivery job per device. */
export interface FanoutJobData {
  userId: string;
  payload: PushPayload;
  /** True when this job was created by quiet-hours deferral. */
  deferred?: boolean;
}

/** Deliver to ONE Web Push subscription (per-device retries never re-send to devices that already got it). */
export interface WebJobData {
  userId: string;
  subscriptionId: string;
  payload: PushPayload;
}

/** Deliver to ONE native FCM token. */
export interface FcmJobData {
  userId: string;
  tokenId: string;
  payload: PushPayload;
}

/** "Is something still unread?" check; the email digest is built at run time, not enqueue time. */
export interface EmailFallbackJobData {
  userId: string;
  /** How many times quiet hours already pushed this check back. */
  deferrals?: number;
}

export type NotificationJobData = FanoutJobData | WebJobData | FcmJobData | EmailFallbackJobData;

const short = (v: string): string => createHash('sha1').update(v).digest('hex').slice(0, 16);

/**
 * Deferred pushes collapse per (user, tag): ten messages from one chat during
 * quiet hours become ONE morning push carrying the latest copy. Untagged
 * pushes have no natural key and get a unique (undefined) id.
 */
export const deferredPushJobId = (userId: string, tag?: string): string | undefined =>
  tag ? `defer_${userId}_${short(tag)}` : undefined;

/** One pending fallback check per user per window; later notifications join its digest. */
export const emailFallbackJobId = (userId: string, deferrals = 0): string =>
  `emailfb_${userId}_${deferrals}`;
