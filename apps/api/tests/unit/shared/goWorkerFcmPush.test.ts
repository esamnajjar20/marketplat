import { sendFcmTargetViaGo, isGoWorkerFcmPushEnabled } from '../../../src/shared/go-worker/fcmPush';

describe('Go FCM target transport', () => {
  const originalEnabled = process.env.GO_WORKER_FCM_PUSH_ENABLED;
  const originalUrl = process.env.GO_WORKER_URL;
  const originalToken = process.env.GO_WORKER_TOKEN;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env.GO_WORKER_URL = 'https://go-worker.example';
    process.env.GO_WORKER_TOKEN = 'internal-secret';
    process.env.GO_WORKER_FCM_PUSH_ENABLED = 'true';
    global.fetch = jest.fn() as unknown as typeof fetch;
  });

  afterEach(() => {
    if (originalEnabled === undefined) delete process.env.GO_WORKER_FCM_PUSH_ENABLED;
    else process.env.GO_WORKER_FCM_PUSH_ENABLED = originalEnabled;
    if (originalUrl === undefined) delete process.env.GO_WORKER_URL;
    else process.env.GO_WORKER_URL = originalUrl;
    if (originalToken === undefined) delete process.env.GO_WORKER_TOKEN;
    else process.env.GO_WORKER_TOKEN = originalToken;
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('keeps the Go sender disabled unless explicitly enabled', () => {
    process.env.GO_WORKER_FCM_PUSH_ENABLED = 'false';
    expect(isGoWorkerFcmPushEnabled()).toBe(false);
    process.env.GO_WORKER_FCM_PUSH_ENABLED = 'true';
    expect(isGoWorkerFcmPushEnabled()).toBe(true);
  });

  it('sends only target/user ids and notification data to the authenticated internal route', async () => {
    (global.fetch as jest.Mock).mockResolvedValue({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ outcome: 'sent' }),
      body: null,
    });

    const result = await sendFcmTargetViaGo({
      userId: 'seller-cuid',
      targetId: 'device-row-cuid',
      payload: { title: 'تنبيه', body: 'لديك رسالة', url: '/inbox', tag: 'message' },
    });

    expect(result).toBe('sent');
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, request] = (global.fetch as jest.Mock).mock.calls[0];
    expect(url).toBe('https://go-worker.example/internal/push/fcm/send');
    expect(request.headers.Authorization).toBe('Bearer internal-secret');
    const body = JSON.parse(request.body);
    expect(body).toEqual({
      userId: 'seller-cuid',
      targetId: 'device-row-cuid',
      payload: { title: 'تنبيه', body: 'لديك رسالة', url: '/inbox', tag: 'message' },
    });
    expect(request.body).not.toContain('fcm-token');
  });

  it.each(['gone', 'transient', 'failed', 'unconfigured', 'missing'] as const)(
    'preserves the Go provider outcome %s',
    async outcome => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: async () => JSON.stringify({ outcome }),
        body: null,
      });
      await expect(
        sendFcmTargetViaGo({
          userId: 'seller-cuid',
          targetId: 'device-row-cuid',
          payload: { title: 'Hello', body: '' },
        })
      ).resolves.toBe(outcome);
    }
  );

  it('uses the durable retry path for worker errors and malformed responses', async () => {
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => 'unavailable',
      body: null,
    });
    (global.fetch as jest.Mock).mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ outcome: 'unknown' }),
      body: null,
    });

    const input = {
      userId: 'seller-cuid',
      targetId: 'device-row-cuid',
      payload: { title: 'Hello', body: '' },
    };
    await expect(sendFcmTargetViaGo(input)).resolves.toBe('transient');
    await expect(sendFcmTargetViaGo(input)).resolves.toBe('transient');
  });

  it('fails closed when the feature is enabled but the worker is not configured', async () => {
    delete process.env.GO_WORKER_TOKEN;
    await expect(
      sendFcmTargetViaGo({
        userId: 'seller-cuid',
        targetId: 'device-row-cuid',
        payload: { title: 'Hello', body: '' },
      })
    ).resolves.toBe('transient');
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
