import webpush from 'web-push';
import { env } from '../../config/env';
import { logger } from './logger';
import { prisma } from '../../config/prisma';

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
    if (!ensureConfigured()) {
      logger.warn('[PUSH NOT SENT — VAPID not configured] Would have sent push', {
        userId,
        title: payload.title,
      });
      return;
    }

    const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
    if (subscriptions.length === 0) return;

    const body = JSON.stringify({
      title: payload.title,
      body: payload.body,
      url: payload.url,
      tag: payload.tag,
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
      await prisma.pushSubscription
        .deleteMany({ where: { endpoint: { in: staleEndpoints } } })
        .catch((err) => logger.warn('Failed to prune stale push subscriptions', { err }));
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
