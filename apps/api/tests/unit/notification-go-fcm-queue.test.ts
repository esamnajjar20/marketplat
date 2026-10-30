import { readFileSync } from 'node:fs';
import { join } from 'node:path';

describe('Go FCM routing for BullMQ notification jobs', () => {
  const source = readFileSync(join(__dirname, '../../src/shared/queue/notificationProcessors.ts'), 'utf8');

  it('continues to enqueue native-device jobs when Go is enabled even without Firebase credentials in Express', () => {
    expect(source).toContain('const useGoFcm = isGoWorkerFcmPushEnabled()');
    expect(source).toContain('useGoFcm || env.fcm.isConfigured');
    expect(source).toContain('sendFcmTargetViaGo({ userId, targetId: tokenId, payload })');
  });

  it('keeps BullMQ transient retries and reports Go misconfiguration as a retryable job failure', () => {
    expect(source).toContain("if (outcome === 'transient') throw new Error('FCM transient failure via Go worker')");
    expect(source).toContain("if (outcome === 'unconfigured') throw new Error('FCM provider is not configured on Go worker')");
  });

  it('retains the Firebase Admin fallback when the Go feature flag is disabled', () => {
    expect(source).toContain('fcmPushService.sendToToken(tok, payload)');
  });
});
