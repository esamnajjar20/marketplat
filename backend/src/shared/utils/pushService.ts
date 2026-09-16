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

      const staleEndpoints: string[] = [];

      await Promise.all(
        subscriptions.map(async (sub) => {
          try {
            await webpush.sendNotification(
              {
                endpoint: sub.endpoint,
                keys: { p256dh: sub.p256dh, auth: sub.auth },
              },
              body
            );
          } catch (err) {
            if (isGoneError(err)) {
              // Expected/routine, not an error worth alerting on — every
              // uninstall or cleared-site-data event produces exactly
              // this. Pruned below rather than logged at error level.
              staleEndpoints.push(sub.endpoint);
              return;
            }
            // Any other failure (network blip, malformed payload,
            // misconfigured VAPID keys) is unexpected and worth
            // surfacing, but must not propagate — see doc comment above
            // on why this stays fire-and-forget.
            logger.warn('Push send failed', { userId, endpoint: sub.endpoint, err });
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
    await Promise.all(userIds.map((userId) => pushService.notifyUser(userId, payload)));
  },
};
