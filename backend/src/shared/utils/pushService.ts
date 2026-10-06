import { createHash } from 'crypto';
import webpush from 'web-push';
import { env } from '../../config/env';
import { logger } from './logger';
import { pushSubscriptionsRepository } from './pushSubscriptionsRepository';
// NEW: fans out to the Capacitor native app's FCM channel alongside
// Web Push below — see fcmPushService.ts's header for why both exist.
// Kept as a fully separate call (not merged logic) so a Web Push
// failure/misconfiguration can never affect native delivery or vice
// versa — same isolation pushService.notifyUser already gives each
// individual browser subscription.
import { fcmPushService } from './fcmPushService';
import {
  evaluateQuietHours,
  resolveQuietTimeZone as resolveQuietTimeZoneImpl,
  type QuietHoursDecision,
} from './quietHours';

/**
 * this is the missing backend half of the frontend's
 * push-subscription plumbing (frontend/lib/pwa.ts's subscribeToPush()
 * and frontend/public/sw.js's 'push' event listener were both already
 * built and waiting for this — see that file's own doc comment).
 *
 * Uses the `web-push` package (standard Web Push protocol, works with
 * any browser's push service — FCM for Chrome/Edge, Mozilla's autopush
 * for Firefox, Apple's for Safari — no vendor SDK/account needed beyond
 * a self-generated VAPID key pair), same "no vendor lock-in" choice as
 * emailService.ts's use of generic SMTP over a provider-specific SDK.
 *
 * Degrades gracefully: if VAPID keys aren't configured
 * (env.webPush.isConfigured is false — the default in dev/test/CI
 * without real keys), every send logs what *would* have been sent
 * instead of throwing. Matches emailService.ts's existing convention
 * for optional third-party integrations — the app must still start and
 * run cleanly without real VAPID credentials.
 *
 * To generate a key pair for a real deployment:
 *   npx web-push generate-vapid-keys
 * Set the public half as both VAPID_PUBLIC_KEY (backend) and
 * NEXT_PUBLIC_VAPID_PUBLIC_KEY (frontend) — they must match exactly,
 * and the private half only ever goes in the backend's VAPID_PRIVATE_KEY.
 */

let configured = false;

function ensureConfigured(): boolean {
  if (!env.webPush.isConfigured) return false;
  if (configured) return true;

  webpush.setVapidDetails(env.webPush.subject, env.webPush.publicKey, env.webPush.privateKey);
  configured = true;
  return true;
}

export interface PushPayload {
  title: string;
  body: string;
  /** Path the SW should open/focus on notificationclick, e.g. '/messages/abc123'. */
  url?: string;
  /** Collapses repeat notifications of the same kind (see sw.js's `renotify`). */
  tag?: string;
  /** Optional absolute image URL for rich notifications (Chrome/Android). */
  image?: string;
  /**
   * When true, delivery is allowed even during the user's quiet hours
   * if they opted into "allow urgent during quiet hours" (default on).
   * Used for new messages.
   */
  urgent?: boolean;
  /** Notification kind (e.g. 'NEW_MESSAGE') — lets the SW pick type-specific actions. */
  type?: string;
  /** Skip quiet-hours suppression (explicit user-triggered test push only). */
  bypassQuietHours?: boolean;
}

// web-push's send rejects with a statusCode on the error object for
// HTTP-level failures from the push service itself (as opposed to a
// network/timeout error, which has no statusCode). 404/410 specifically
// mean the push service has permanently discarded this endpoint — the
// user uninstalled the app, cleared site data, or the subscription
// otherwise expired browser-side. Retrying or keeping the row around
// only accumulates dead rows and wasted sends, so the caller prunes it.
interface WebPushError {
  statusCode?: number;
}

/**
 * PUSH-TOPIC-HASH-01: RFC 8030 Topic must be <=32 URL-safe base64 chars.
 * The old code sanitized then sliced the raw tag, so 'conversation-<cuid>'
 * (38 chars) lost the tail of its id — two different conversations could
 * share a topic and the push service would silently replace one pending
 * message with the other. Hashing keeps every distinct tag distinct and
 * the same tag stable (which is what collapse-by-topic needs).
 */
export function buildPushTopic(tag?: string): string | undefined {
  if (!tag) return undefined;
  return createHash('sha256').update(tag).digest('base64url').slice(0, 32);
}

function isGoneError(err: unknown): boolean {
  const statusCode = (err as WebPushError)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

/** Re-exported for existing callers/tests; the logic lives in quietHours.ts. */
export const resolveQuietTimeZone = resolveQuietTimeZoneImpl;

/**
 * Quiet hours live on User.notificationPreferences (see quietHours.ts for the
 * keys). Only suppresses/defers external push — in-app rows are still created
 * by callers. the decision carries `resumeInMs` so the queue can
 * defer the push to the end of the window instead of dropping it.
 * Fails open (a lookup error must never swallow a push).
 */
async function loadQuietHoursDecision(
  userId: string,
  urgent?: boolean,
): Promise<QuietHoursDecision> {
  try {
    const { prisma } = await import('../../config/prisma');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });
    return evaluateQuietHours(user?.notificationPreferences, urgent);
  } catch {
    return { blocked: false };
  }
}

/** switch. Optional chaining: older test mocks of `env` have no such key. */
const queueEnabled = (): boolean => env.notificationQueue?.enabled === true;

/**
 * Runs `op` against the (lazily imported) queue module. Any failure — bullmq
 * not installed, Redis down, enqueue timeout — returns false so the caller
 * falls back to inline delivery. A push must degrade, never disappear.
 */
async function viaQueue(
  op: (q: typeof import('../queue/notificationQueue')) => Promise<void>,
): Promise<boolean> {
  try {
    const q = await import('../queue/notificationQueue');
    await op(q);
    return true;
  } catch (err) {
    logger.warn('Notification queue unavailable — falling back to inline delivery', { err });
    return false;
  }
}

/** Request body shared by the inline and queued Web Push paths. */
function buildPushBody(payload: PushPayload): string {
  return JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url,
    tag: payload.tag,
    image: payload.image,
    urgent: payload.urgent,
    type: payload.type,
  });
}

/**
 * TTL / urgency / topic for one push — shared by the inline and queued paths.
 *
 * web-push's default TTL is 0, which tells the
 * push service to *discard* the message if the device can't take it right now.
 * On Gaza's mobile networks the phone is often offline, asleep or behind a NAT,
 * so with TTL 0 every notification arriving in any of those states is lost.
 * 24h for normal notifications ("show me what I missed when I open the app");
 * 3h for urgent ones (a 24h-old "new message" is worse than none). Urgency maps
 * to RFC 8030's `Urgency` hint (wake the radio now vs. batch with other traffic).
 *
 * / PUSH-TOPIC-HASH-01: `tag` becomes the RFC 8030
 * `Topic` so repeats of the same kind collapse into one banner on the device;
 * it is hashed (buildPushTopic) because Topic is limited to 32 URL-safe chars.
 */
function pushOptions(payload: PushPayload): {
  TTL: number;
  urgency: 'high' | 'normal';
  topic?: string;
} {
  const topic = buildPushTopic(payload.tag);
  return {
    TTL: payload.urgent ? 3 * 60 * 60 : 24 * 60 * 60,
    urgency: payload.urgent ? 'high' : 'normal',
    ...(topic ? { topic } : {}),
  };
}

/**
 * one-shot retry around webpush.sendNotification.
 * Returns:
 *   'sent'   — delivered to the push service (not to the device — that
 *              part depends on TTL/urgency, see below)
 *   'gone'   — 404/410; caller should prune this endpoint
 *   'failed' — non-retryable or second failure; caller just logs
 *
 * 'gone' short-circuits the retry — retrying a permanently-dead
 * endpoint only burns quota. Everything else (5xx, 429, network/timeout)
 * is treated as transient and retried once after 1.5s. Non-transient
 * status codes (4xx other than 429) are payload/key/config problems a
 * retry can't fix.
 */
async function sendWithRetry(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  body: string,
  options: { TTL: number; urgency: 'very-low' | 'low' | 'normal' | 'high'; topic?: string },
): Promise<'sent' | 'gone' | 'failed'> {
  try {
    await webpush.sendNotification(subscription, body, options);
    return 'sent';
  } catch (err) {
    if (isGoneError(err)) return 'gone';

    const statusCode = (err as WebPushError)?.statusCode;
    const isTransient =
      statusCode === undefined || statusCode === 429 || (statusCode >= 500 && statusCode < 600);

    if (!isTransient) {
      logger.warn('Push send failed (non-retryable)', { statusCode, err });
      return 'failed';
    }

    await new Promise((r) => setTimeout(r, 1500));
    try {
      await webpush.sendNotification(subscription, body, options);
      return 'sent';
    } catch (retryErr) {
      if (isGoneError(retryErr)) return 'gone';
      logger.warn('Push send failed after retry', { err: retryErr });
      return 'failed';
    }
  }
}

export const pushService = {
  /**
   * Sends one push to every subscription row the given user has (one
   * per device/browser they've enabled push on). Fire-and-forget from
   * the caller's perspective, matching notificationEvents' own
   * fire-and-forget convention in notifications.service.ts — a push
   * failing to send should never fail the underlying action (a message
   * still sends even if the push fan-out has a transient error), so
   * callers should not await this inside the same transaction as the
   * primary write.
   *
   * Deliberately takes a userId and loads subscriptions itself (rather
   * than requiring the caller to pass them in) so every call site in
   * notifications.service.ts stays a single line, the same shape as
   * notificationsRepository.create.
   */
  notifyUser: async (userId: string, payload: PushPayload): Promise<void> => {
    // Quiet hours apply to both channels (in-app rows are still written by the caller).
    let quiet: QuietHoursDecision = { blocked: false };
    if (!payload.bypassQuietHours) quiet = await loadQuietHoursDecision(userId, payload.urgent);

    if (quiet.blocked) {
      // with the queue on, hold the push until the window ends
      // (collapsed per tag) instead of dropping it. Queue off/unavailable →
      // the previous behaviour: skip.
      if (queueEnabled()) {
        // Copy out of the narrowed `let` — TS drops narrowing inside closures.
        const resumeInMs = quiet.resumeInMs;
        const deferred = await viaQueue((q) => q.deferPush(userId, payload, resumeInMs));
        if (deferred) return;
      }
      logger.info('[PUSH SKIPPED — quiet hours]', { userId, title: payload.title });
      return;
    }

    if (queueEnabled()) {
      const queued = await viaQueue((q) => q.enqueuePush(userId, payload));
      if (queued) return;
    }
    await pushService.deliverInline(userId, payload);
  },

  /** Quiet-hours decision for a user (fails open). Used by queue workers when a deferred job wakes. */
  quietHoursDecision: (userId: string, urgent?: boolean): Promise<QuietHoursDecision> =>
    loadQuietHoursDecision(userId, urgent),

  /**
   * The pre-delivery path (FCM + every Web Push subscription of the
   * user, inline, one retry per device). Used when the queue is disabled or
   * unavailable. Never throws.
   */
  deliverInline: async (userId: string, payload: PushPayload): Promise<void> => {
    // NEW: native app push, fully independent of the Web Push send
    // below (own try/catch, own graceful-degradation, see
    // fcmPushService.ts). Fire-and-forget here too, matching this
    // whole function's own contract with ITS callers.
    void fcmPushService.notifyUser(userId, payload).catch(() => undefined);

    // wraps the whole body (not just the per-subscription
    // sendNotification below, which already had its own try/catch) so
    // an unexpected failure anywhere in this function — most notably
    // prisma.pushSubscription.findMany() below, which previously had no
    // guard at all — can never escape as an unhandled promise rejection.
    // notificationEvents in notifications.service.ts calls this with
    // `void pushService.notifyUser(...)` (intentional fire-and-forget —
    // a push failing must never fail the underlying action), which means
    // ANY rejection this function produces was previously silent and
    // untracked at the process level. Catching here, at the single
    // shared entry point, all three call sites
    // (onNewMessage/onFavoritedAdPriceChanged/onSavedSearchMatched) at
    // once instead of requiring each `void` call site to remember its
    // own `.catch()`.
    try {
      if (!ensureConfigured()) {
        logger.warn('[PUSH NOT SENT — VAPID not configured] Would have sent push', {
          userId,
          title: payload.title,
        });
        return;
      }

      const subscriptions = await pushSubscriptionsRepository.findManyByUserId(userId);
      if (subscriptions.length === 0) return;

      const body = buildPushBody(payload);
      // TTL / urgency / topic: see pushOptions() above.
      const options = pushOptions(payload);

      const staleEndpoints: string[] = [];
      const stats = { sent: 0, gone: 0, failed: 0 };

      await Promise.all(
        subscriptions.map(async (sub) => {
          const result = await sendWithRetry(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
            options
          );

          stats[result] += 1;

          if (result === 'gone') {
            // Expected/routine, not an error worth alerting on — every
            // uninstall or cleared-site-data event produces exactly
            // this. Pruned below rather than logged at error level.
            staleEndpoints.push(sub.endpoint);
          }
        })
      );

      // PUSH-STATS-01: first observability for delivery. Only logged when
      // something went wrong (gone/failed) to keep the happy path quiet.
      // A burst of `failed` with 401/403 warnings above usually means the
      // VAPID key pair no longer matches the one subscriptions were created
      // with — deliberately NOT auto-pruned (a misconfigured deploy would
      // otherwise delete every user's subscription).
      if (stats.gone > 0 || stats.failed > 0) {
        logger.info('[PUSH] delivery summary', { userId, ...stats, tag: payload.tag });
      }

      if (staleEndpoints.length > 0) {
        await pushSubscriptionsRepository
          .deleteByEndpoints(staleEndpoints)
          .catch((err) => logger.warn('Failed to prune stale push subscriptions', { err }));
      }
    } catch (err) {
      // Catches anything not already handled above — chiefly a failed
      // findMany(), but also any future code added to this function
      // that forgets its own try/catch. Logged at error level (unlike
      // the routine per-subscription warn above) since reaching this
      // branch means the whole push attempt for this user was aborted,
      // not just one of several subscriptions.
      logger.error('pushService.notifyUser failed unexpectedly', { userId, err });
    }
  },

  /**
   * ONE attempt to ONE Web Push subscription — no sleeping, no
   * internal retry (the queue's backoff owns that). 'gone' means the push
   * service discarded the endpoint and the row has been pruned; 'transient'
   * (5xx / 429 / network) should be retried; 'failed' cannot be by
   * retrying (bad key, payload too large, VAPID mismatch — never auto-pruned,
   * see PUSH-STATS-01).
   */
  sendToSubscription: async (
    sub: { endpoint: string; p256dh: string; auth: string },
    payload: PushPayload,
  ): Promise<'sent' | 'gone' | 'transient' | 'failed' | 'unconfigured'> => {
    if (!ensureConfigured()) return 'unconfigured';
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        buildPushBody(payload),
        pushOptions(payload),
      );
      return 'sent';
    } catch (err) {
      if (isGoneError(err)) {
        await pushSubscriptionsRepository
          .deleteByEndpoints([sub.endpoint])
          .catch((e) => logger.warn('Failed to prune stale push subscription', { err: e }));
        return 'gone';
      }
      const statusCode = (err as WebPushError)?.statusCode;
      const transient =
        statusCode === undefined || statusCode === 429 || (statusCode >= 500 && statusCode < 600);
      if (!transient) logger.warn('Push send failed (non-retryable)', { statusCode, err });
      return transient ? 'transient' : 'failed';
    }
  },

  /** Same fan-out shape as notificationEvents' createMany-backed events
   * (onFavoritedAdPriceChanged, onSavedSearchMatch, onStoreNewProduct)
   * — one call per recipient rather than a single batched web-push call,
   * since each recipient's subscriptions and payload are independent. */
  notifyUsers: async (userIds: string[], payload: PushPayload): Promise<void> => {
    if (userIds.length === 0) return;
    // bound the parallel fan-out. A
    // broadcast to every user (e.g. an admin announcement) can pass
    // thousands of ids; the previous Promise.all spawned all of them
    // at once — thousands of concurrent DB reads plus thousands of
    // concurrent webpush.sendNotification calls, exhausting both the
    // Prisma connection pool and libuv's sockets. Same class of
    // problem bulkRunner.ts caps at 10; using the same chunked pattern
    // here keeps memory bounded and lets a failing provider back off
    // naturally instead of piling every request on at once.
    //
    // Deduped first for the same reason bulkRunner does: a single user
    // appearing twice in the input would otherwise get two push
    // deliveries for one logical event.
    const FANOUT_CONCURRENCY = 10;
    const unique = Array.from(new Set(userIds));
    for (let i = 0; i < unique.length; i += FANOUT_CONCURRENCY) {
      const chunk = unique.slice(i, i + FANOUT_CONCURRENCY);
      await Promise.all(chunk.map((userId) => pushService.notifyUser(userId, payload)));
    }
  },
};
