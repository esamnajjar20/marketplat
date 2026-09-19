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

/**
 * FIX PWA-PUSH-01: this is the missing backend half of the frontend's
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

function isGoneError(err: unknown): boolean {
  const statusCode = (err as WebPushError)?.statusCode;
  return statusCode === 404 || statusCode === 410;
}

/** Local time "HH:mm" in Asia/Gaza (Palestine) for quiet-hours checks. */
function currentTimeInGaza(): { hours: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Gaza',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).formatToParts(new Date());
  const hours = Number(parts.find((p) => p.type === 'hour')?.value ?? '0');
  const minutes = Number(parts.find((p) => p.type === 'minute')?.value ?? '0');
  return { hours, minutes };
}

function parseHm(value: unknown, fallback: string): { h: number; m: number } {
  const raw = typeof value === 'string' && /^\d{1,2}:\d{2}$/.test(value) ? value : fallback;
  const [h, m] = raw.split(':').map((n) => Number(n));
  return {
    h: Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 22,
    m: Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0,
  };
}

/**
 * Quiet hours live on User.notificationPreferences (jsonb):
 *   quietHoursEnabled?: boolean (default false)
 *   quietHoursStart?: "HH:mm" (default "22:00")
 *   quietHoursEnd?: "HH:mm" (default "08:00")
 *   quietHoursAllowUrgent?: boolean (default true)
 * Only suppresses external push — in-app rows are still created by callers.
 */
async function isInQuietHoursBlockingPush(userId: string, urgent?: boolean): Promise<boolean> {
  try {
    const { prisma } = await import('../../config/prisma');
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { notificationPreferences: true },
    });
    const prefs =
      user?.notificationPreferences && typeof user.notificationPreferences === 'object'
        ? (user.notificationPreferences as Record<string, unknown>)
        : {};
    if (prefs.quietHoursEnabled !== true) return false;
    if (urgent && prefs.quietHoursAllowUrgent !== false) return false;

    const start = parseHm(prefs.quietHoursStart, '22:00');
    const end = parseHm(prefs.quietHoursEnd, '08:00');
    const { hours, minutes } = currentTimeInGaza();
    const now = hours * 60 + minutes;
    const startMin = start.h * 60 + start.m;
    const endMin = end.h * 60 + end.m;

    // Window can span midnight (22:00 → 08:00) or sit in the same day (13:00 → 15:00).
    if (startMin === endMin) return false;
    if (startMin < endMin) return now >= startMin && now < endMin;
    return now >= startMin || now < endMin;
  } catch {
    return false;
  }
}

/**
 * FIX PUSH-RETRY-01: one-shot retry around webpush.sendNotification.
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
    // NEW: native app push, fully independent of the Web Push send
    // below (own try/catch, own graceful-degradation, see
    // fcmPushService.ts). Fire-and-forget here too, matching this
    // whole function's own contract with ITS callers.
    // Quiet hours: skip both channels when blocking (in-app still written by caller).
    if (await isInQuietHoursBlockingPush(userId, payload.urgent)) {
      logger.info('[PUSH SKIPPED — quiet hours]', { userId, title: payload.title });
      return;
    }

    void fcmPushService.notifyUser(userId, payload).catch(() => undefined);

    // AUDIT-FIX 2.1: wraps the whole body (not just the per-subscription
    // sendNotification below, which already had its own try/catch) so
    // an unexpected failure anywhere in this function — most notably
    // prisma.pushSubscription.findMany() below, which previously had no
    // guard at all — can never escape as an unhandled promise rejection.
    // notificationEvents in notifications.service.ts calls this with
    // `void pushService.notifyUser(...)` (intentional fire-and-forget —
    // a push failing must never fail the underlying action), which means
    // ANY rejection this function produces was previously silent and
    // untracked at the process level. Catching here, at the single
    // shared entry point, fixes all three call sites
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

      const body = JSON.stringify({
        title: payload.title,
        body: payload.body,
        url: payload.url,
        tag: payload.tag,
        image: payload.image,
        urgent: payload.urgent,
      });

      // FIX PUSH-TTL-AND-URGENCY-01: web-push's default TTL is 0, which
      // means the push service is instructed to *discard the message*
      // if it can't be delivered to the device immediately. That default
      // silently breaks the entire purpose of push for this app: on
      // Gaza's mobile networks the phone is frequently offline, in
      // deep sleep, or behind a NAT the push service can't reach right
      // away. With TTL: 0, every notification that arrives during any
      // of those states is dropped and never retried. WhatsApp/Telegram
      // and every other production push implementation set a real TTL
      // for exactly this reason.
      //
      // 24 hours for normal notifications (matches the "next time you
      // open the app, you want to see what you missed" mental model),
      // 3 hours for urgent ones (chat messages — a 24h-old "you have a
      // new message" is worse than not sending it at all). Urgency maps
      // to RFC 8030's `Urgency` hint so the push service knows whether
      // to wake a sleeping radio immediately (`high`) or batch it with
      // other traffic (`normal`).
      const ttlSeconds = payload.urgent ? 3 * 60 * 60 : 24 * 60 * 60;
      const urgency: 'high' | 'normal' = payload.urgent ? 'high' : 'normal';

      // FIX PUSH-TOPIC-COLLAPSE-01: when a caller provides `tag`, use it
      // as the RFC 8030 `Topic` so multiple pushes of the same kind
      // ("you have a new message in conversation X") collapse into one
      // on the device, instead of stacking a wall of identical banners.
      // web-push requires the topic be ≤32 chars from the URL-safe
      // Base64 alphabet, so it's sanitized conservatively.
      const safeTopic = (payload.tag ?? '')
        .replace(/[^A-Za-z0-9_-]/g, '')
        .slice(0, 32);

      const staleEndpoints: string[] = [];

      await Promise.all(
        subscriptions.map(async (sub) => {
          const result = await sendWithRetry(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body,
            {
              TTL: ttlSeconds,
              urgency,
              ...(safeTopic ? { topic: safeTopic } : {}),
            }
          );

          if (result === 'gone') {
            // Expected/routine, not an error worth alerting on — every
            // uninstall or cleared-site-data event produces exactly
            // this. Pruned below rather than logged at error level.
            staleEndpoints.push(sub.endpoint);
          }
        })
      );

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

  /** Same fan-out shape as notificationEvents' createMany-backed events
   * (onFavoritedAdPriceChanged, onSavedSearchMatch, onStoreNewProduct)
   * — one call per recipient rather than a single batched web-push call,
   * since each recipient's subscriptions and payload are independent. */
  notifyUsers: async (userIds: string[], payload: PushPayload): Promise<void> => {
    if (userIds.length === 0) return;
    // FIX PUSH-FANOUT-CONCURRENCY-01: bound the parallel fan-out. A
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
