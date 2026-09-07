import { env } from '../../config/env';
import { logger } from './logger';
import { fcmDeviceTokensRepository } from './fcmDeviceTokensRepository';

/**
 * NEW — native (Capacitor/Android/iOS) push counterpart to
 * pushService.ts (Web Push/VAPID, browser-only). See that file's
 * header for why Web Push exists; this exists because a WebView has
 * no persistent background process of its own, so its Push API
 * subscriptions are not a reliable way to wake a closed/backgrounded
 * native app — the OS-level FCM channel this uses is. Uses Google's
 * `firebase-admin` SDK (Admin SDK, not a REST reimplementation) since
 * FCM's HTTP v1 API requires OAuth2 service-account signing that the
 * SDK already handles.
 *
 * Same graceful-degradation convention as pushService.ts: if Firebase
 * credentials aren't configured (env.fcm.isConfigured false — the
 * default without real credentials), every send logs what *would*
 * have been sent instead of throwing, so the app keeps starting and
 * running cleanly without them.
 *
 * `firebase-admin` needs to be added to package.json (see this repo's
 * root README-CAPACITOR.md) — it is not yet a dependency, matching
 * the `web-push` package's own pre-existing presence for the Web Push
 * side.
 */

let app: import('firebase-admin/app').App | null = null;

async function ensureConfigured(): Promise<boolean> {
  if (!env.fcm.isConfigured) return false;
  if (app) return true;

  const { initializeApp, cert, getApps } = await import('firebase-admin/app');
  const existing = getApps();
  app =
    existing[0] ??
    initializeApp({
      credential: cert({
        projectId: env.fcm.projectId,
        clientEmail: env.fcm.clientEmail,
        privateKey: env.fcm.privateKey,
      }),
    });
  return true;
}

export interface FcmPushPayload {
  title: string;
  body: string;
  /** Path the app should open on tap — read by lib/capacitor/nativePush.ts's onNativePushTapped. */
  url?: string;
  tag?: string;
}

// FCM's messaging().send() rejects with an `errorInfo.code` for
// HTTP-level failures. These two specifically mean the token is
// permanently dead (app uninstalled, token expired/rotated) — same
// "expected, prune don't alert" handling as pushService.ts's
// isGoneError for Web Push's 404/410.
interface FcmSendError {
  errorInfo?: { code?: string };
}

function isDeadTokenError(err: unknown): boolean {
  const code = (err as FcmSendError)?.errorInfo?.code;
  return code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token';
}

export const fcmPushService = {
  /** Same fire-and-forget contract as pushService.notifyUser — callers use `void`. */
  notifyUser: async (userId: string, payload: FcmPushPayload): Promise<void> => {
    try {
      if (!(await ensureConfigured())) {
        logger.warn('[FCM PUSH NOT SENT — Firebase not configured] Would have sent push', {
          userId,
          title: payload.title,
        });
        return;
      }

      const tokens = await fcmDeviceTokensRepository.findManyByUserId(userId);
      if (tokens.length === 0) return;

      const { getMessaging } = await import('firebase-admin/messaging');
      const staleTokens: string[] = [];

      await Promise.all(
        tokens.map(async (deviceToken) => {
          try {
            await getMessaging(app!).send({
              token: deviceToken.token,
              notification: { title: payload.title, body: payload.body },
              data: { url: payload.url ?? '', tag: payload.tag ?? '' },
            });
          } catch (err) {
            if (isDeadTokenError(err)) {
              staleTokens.push(deviceToken.token);
              return;
            }
            logger.warn('FCM push send failed', { userId, err });
          }
        })
      );

      if (staleTokens.length > 0) {
        await fcmDeviceTokensRepository
          .deleteByTokens(staleTokens)
          .catch((err) => logger.warn('Failed to prune stale FCM tokens', { err }));
      }
    } catch (err) {
      logger.error('fcmPushService.notifyUser failed unexpectedly', { userId, err });
    }
  },

  notifyUsers: async (userIds: string[], payload: FcmPushPayload): Promise<void> => {
    if (userIds.length === 0) return;
    await Promise.all(userIds.map((userId) => fcmPushService.notifyUser(userId, payload)));
  },
};
