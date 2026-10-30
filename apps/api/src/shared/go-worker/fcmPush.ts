import { logger } from '../utils/logger';
import type { FcmPushPayload, FcmSendOutcome } from '../utils/fcmPushService';

export type GoFcmTargetOutcome = FcmSendOutcome | 'missing';

const VALID_OUTCOMES = new Set<GoFcmTargetOutcome>([
  'sent',
  'gone',
  'transient',
  'failed',
  'unconfigured',
  'missing',
]);

/**
 * Opt-in only. Keep the existing Firebase Admin SDK path as the default until
 * the same service-account credentials are installed and verified on Go.
 */
export function isGoWorkerFcmPushEnabled(): boolean {
  return process.env.GO_WORKER_FCM_PUSH_ENABLED?.trim().toLowerCase() === 'true';
}

/**
 * Send one durable delivery target through Go. The raw FCM token never leaves
 * PostgreSQL or crosses the Express/Go boundary; Go resolves it by targetId +
 * userId. Transport ambiguity is returned as transient and is never followed
 * by a local Express send, which could duplicate an already-accepted FCM send.
 */
export async function sendFcmTargetViaGo(input: {
  userId: string;
  targetId: string;
  payload: FcmPushPayload;
}): Promise<GoFcmTargetOutcome> {
  const baseUrl = process.env.GO_WORKER_URL?.trim().replace(/\/+$/, '');
  const token = process.env.GO_WORKER_TOKEN?.trim();
  if (!baseUrl || !token) {
    logger.error('[push-fcm-go] enabled but GO_WORKER_URL/GO_WORKER_TOKEN is missing');
    return 'transient';
  }

  try {
    const response = await fetch(`${baseUrl}/internal/push/fcm/send`, {
      method: 'POST',
      redirect: 'error',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        userId: input.userId,
        targetId: input.targetId,
        payload: {
          title: input.payload.title,
          body: input.payload.body,
          url: input.payload.url ?? '',
          tag: input.payload.tag ?? '',
        },
      }),
      signal: AbortSignal.timeout(14_000),
    });

    if (!response.ok) {
      logger.warn('[push-fcm-go] worker returned a non-success status; durable target will retry', {
        status: response.status,
      });
      await response.body?.cancel().catch(() => undefined);
      return 'transient';
    }

    const body = await response.text();
    if (body.length > 2_048) {
      logger.warn('[push-fcm-go] worker response exceeded the expected size');
      return 'transient';
    }
    let result: unknown;
    try {
      result = JSON.parse(body);
    } catch {
      result = undefined;
    }
    if (
      typeof result === 'object' &&
      result !== null &&
      'outcome' in result &&
      typeof result.outcome === 'string' &&
      VALID_OUTCOMES.has(result.outcome as GoFcmTargetOutcome)
    ) {
      return result.outcome as GoFcmTargetOutcome;
    }
    logger.warn('[push-fcm-go] worker returned an invalid outcome; durable target will retry');
    return 'transient';
  } catch (error) {
    logger.warn('[push-fcm-go] worker call failed; durable target will retry', {
      errorType: error instanceof Error ? error.name : 'unknown',
    });
    return 'transient';
  }
}
