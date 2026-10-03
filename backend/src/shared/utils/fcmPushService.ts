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
        // FIX FCM-PRIVATE-KEY-NEWLINES: Firebase Console provides the
        // private key with literal "\n" sequences (PEM format expects
        // real newlines). When pasted into Render's env UI — which
        // doesn't unescape backslash sequences — the raw string arrives
        // here with "\n" as two literal characters, and firebase-admin's
        // cert() throws "Failed to parse private key: error:0909006C:PEM
        // routines" on every initializeApp. This replaces those literal
        // sequences with real newlines before the SDK sees the value.
        // Idempotent: if the key already has real newlines (loaded from
        // a .env file, a local JSON file, or anywhere else that
        // preserved them), the regex matches nothing and nothing changes.
        privateKey: env.fcm.privateKey.replace(/\\n/g, '\n'),
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

export type FcmSendOutcome = 'sent' | 'gone' | 'transient' | 'failed' | 'unconfigured';

export const fcmPushService = {
  /**
   * Phase 3: ONE attempt to ONE token, no internal retry and no sleeping —
   * the queue owns retries (backoff, attempts) so a transient FCM error is
   * re-run per device instead of re-sending to every device of the user.
   * 'gone' = token permanently dead (row already pruned here);
   * 'transient' = caller should retry; 'failed' = retrying cannot help.
   */
  sendToToken: async (
    deviceToken: { token: string },
    payload: FcmPushPayload,
  ): Promise<FcmSendOutcome> => {
    if (!(await ensureConfigured())) return 'unconfigured';
    try {
      const { getMessaging } = await import('firebase-admin/messaging');
      await getMessaging(app!).send({
        token: deviceToken.token,
        notification: { title: payload.title, body: payload.body },
        data: { url: payload.url ?? '', tag: payload.tag ?? '' },
      });
      return 'sent';
    } catch (err) {
      if (isDeadTokenError(err)) {
        await fcmDeviceTokensRepository
          .deleteByTokens([deviceToken.token])
          .catch((e) => logger.warn('Failed to prune stale FCM token', { err: e }));
        return 'gone';
      }
      const code = (err as FcmSendError)?.errorInfo?.code;
      const transient =
        code === 'messaging/server-unavailable' ||
        code === 'messaging/internal-error' ||
        code === 'messaging/unavailable' ||
        code === 'messaging/unknown-error' ||
        code === undefined; // network-level failure: no FCM error code at all
      if (!transient) logger.warn('FCM push send failed (non-retryable)', { code, err });
      return transient ? 'transient' : 'failed';
    }
  },

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
      const messaging = getMessaging(app!);
      const staleTokens: string[] = [];

      await Promise.all(
        tokens.map(async (deviceToken) => {
          const sendArgs = {
            token: deviceToken.token,
            notification: { title: payload.title, body: payload.body },
            data: { url: payload.url ?? '', tag: payload.tag ?? '' },
          };

          try {
            await messaging.send(sendArgs);
            return;
          } catch (err) {
            if (isDeadTokenError(err)) {
              staleTokens.push(deviceToken.token);
              return;
            }

            // FIX PUSH-FCM-RETRY-01: one retry on FCM's own documented
            // transient failure codes. Before this, a single 503 from
            // FCM's edge silently dropped the notification — the most
            // common failure mode on Gaza's flaky mobile networks, where
            // "notification never arrived" is otherwise indistinguishable
            // from "no notification was sent." Anything else (bad
            // payload, mismatched credentials, quota) is not retryable
            // and logged without a second attempt.
            const code = (err as FcmSendError)?.errorInfo?.code;
            const isTransient =
              code === 'messaging/server-unavailable' ||
              code === 'messaging/internal-error' ||
              code === 'messaging/unavailable' ||
              code === 'messaging/unknown-error';

            if (!isTransient) {
              logger.warn('FCM push send failed (non-retryable)', { userId, code, err });
              return;
            }

            await new Promise((r) => setTimeout(r, 1500));
            try {
              await messaging.send(sendArgs);
            } catch (retryErr) {
              if (isDeadTokenError(retryErr)) {
                staleTokens.push(deviceToken.token);
                return;
              }
              logger.warn('FCM push send failed after retry', { userId, err: retryErr });
            }
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
