/**
 * __tests__/unit/lib/pwa.test.ts
 *
 * Covers the full lib/pwa.ts surface:
 *
 *  1. urlBase64ToUint8Array (private, exercised indirectly through
 *     subscribeToPush): converts the VAPID public key from its
 *     URL-safe base64 form into the BufferSource PushManager.subscribe
 *     needs. A wrong padding/replace order here doesn't throw — it
 *     silently produces garbage bytes, so the only way to catch it is
 *     asserting the actual decoded output.
 *
 *  2. subscribeToPush's compensating-unsubscribe ():
 *     if saving the subscription to the backend fails, the code must
 *     unsubscribe from the browser's PushManager immediately, or the
 *     browser ends up subscribed while the server doesn't know it and
 *     the UI shows "not enabled" — a real state-desync bug the header
 *     comment documents having once already.
 *
 *  3. registerServiceWorker: SSR guard, unsupported-browser guard, dev-mode
 *     skip (with the NEXT_PUBLIC_ENABLE_SW_DEV escape hatch), successful
 *     registration, the updatefound -> installed -> waiting-listener path,
 *     the controllerchange -> single reload path, and the try/catch that
 *     keeps a registration failure from throwing.
 *
 *  4. onServiceWorkerUpdate: subscribe/unsubscribe of listeners.
 *
 *  5. activateWaitingServiceWorker: posts SKIP_WAITING to a waiting worker,
 *     no-ops when there is none.
 *
 * isPushSupported/getPushSubscriptionState are covered too since
 * subscribeToPush/unsubscribeFromPush both gate on the former.
 *
 * Isolation note: every test installs and tears down its own globals
 * explicitly (no reliance on a shared beforeEach/afterEach pair for
 * navigator.serviceWorker / window.PushManager / window.Notification).
 * A previous version of this file removed navigator.serviceWorker with
 * `Object.defineProperty(nav, 'serviceWorker', { value: undefined })`,
 * which leaves the property key present — `'serviceWorker' in navigator`
 * stays `true` even though the value is undefined — silently defeating
 * isPushSupported's feature-detection and cascading into every test that
 * ran after it in the same file. We use `delete` (jsdom's navigator is a
 * plain configurable object, so this is safe) and reinstall everything
 * per-test rather than relying on afterEach ordering.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('@/api/client', () => ({
  apiClient: { post: vi.fn(), delete: vi.fn() },
}));

import { apiClient } from '@/api/client';
import {
  isPushSupported,
  getPushSubscriptionState,
  subscribeToPush,
  unsubscribeFromPush,
  registerServiceWorker,
  onServiceWorkerUpdate,
  activateWaitingServiceWorker,
} from '@/lib/pwa';

const ORIGINAL_ENV = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
const ORIGINAL_NODE_ENV = process.env.NODE_ENV;

// jsdom's navigator/window are plain configurable objects, so both
// defineProperty (to stub) and delete (to remove) work reliably —
// `delete` is required for teardown so the `in` operator reports the
// property as genuinely absent, not merely undefined.

function installServiceWorkerStub(overrides: {
  pushManager?: Partial<{
    getSubscription: () => Promise<unknown>;
    subscribe: (opts: unknown) => Promise<unknown>;
  }>;
  register?: (...args: unknown[]) => Promise<unknown>;
  extra?: Record<string, unknown>;
} = {}) {
  const pushManager = {
    getSubscription: vi.fn().mockResolvedValue(null),
    subscribe: vi.fn(),
    ...overrides.pushManager,
  };

  const registration = {
    pushManager,
    waiting: null as null | { postMessage: (msg: unknown) => void },
    installing: null as null | {
      state: string;
      addEventListener: (evt: string, cb: () => void) => void;
    },
    addEventListener: vi.fn(),
    ...overrides.extra,
  };

  const swContainer = {
    ready: Promise.resolve(registration),
    register: overrides.register ?? vi.fn().mockResolvedValue(registration),
    controller: null,
    addEventListener: vi.fn(),
  };

  Object.defineProperty(window.navigator, 'serviceWorker', {
    value: swContainer,
    configurable: true,
  });

  return { registration, pushManager, swContainer };
}

function removeServiceWorkerGlobal() {
  // @ts-expect-error test cleanup — must fully remove the key, not just
  // set it to undefined, or `'serviceWorker' in navigator` stays true.
  delete window.navigator.serviceWorker;
}

function installPushManagerGlobal() {
  // isPushSupported checks 'PushManager' in window
  Object.defineProperty(window, 'PushManager', {
    value: function PushManager() {},
    configurable: true,
  });
}

function removePushManagerGlobal() {
  // @ts-expect-error test cleanup
  delete window.PushManager;
}

function installNotificationStub(permission: NotificationPermission) {
  Object.defineProperty(window, 'Notification', {
    value: { requestPermission: vi.fn().mockResolvedValue(permission) },
    configurable: true,
  });
}

function removeNotificationGlobal() {
  // @ts-expect-error test cleanup
  delete window.Notification;
}

beforeEach(() => {
  vi.clearAllMocks();
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BEl62iUYgUivxIkv69yViEuiBIa40HI0DLLuxazjBHNJcXsMDMZW-M9GKJgKcQe';
  process.env.NODE_ENV = 'test';
});

afterEach(() => {
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = ORIGINAL_ENV;
  process.env.NODE_ENV = ORIGINAL_NODE_ENV;
  delete process.env.NEXT_PUBLIC_ENABLE_SW_DEV;
  removePushManagerGlobal();
  removeServiceWorkerGlobal();
  removeNotificationGlobal();
});

describe('isPushSupported', () => {
  it('is false when serviceWorker is not in navigator', () => {
    removeServiceWorkerGlobal();
    installPushManagerGlobal();
    expect(isPushSupported()).toBe(false);
  });

  it('is false when PushManager is not in window', () => {
    installServiceWorkerStub();
    removePushManagerGlobal();
    expect(isPushSupported()).toBe(false);
  });

  it('is true when both serviceWorker and PushManager are available', () => {
    installServiceWorkerStub();
    installPushManagerGlobal();
    expect(isPushSupported()).toBe(true);
  });
});

describe('getPushSubscriptionState', () => {
  it('returns "unsupported" when push is not supported', async () => {
    removeServiceWorkerGlobal();
    removePushManagerGlobal();
    expect(await getPushSubscriptionState()).toBe('unsupported');
  });

  it('returns "subscribed" when a subscription already exists', async () => {
    installPushManagerGlobal();
    installServiceWorkerStub({
      pushManager: { getSubscription: vi.fn().mockResolvedValue({ endpoint: 'https://x' }) },
    });
    expect(await getPushSubscriptionState()).toBe('subscribed');
  });

  it('returns "unsubscribed" when there is no existing subscription', async () => {
    installPushManagerGlobal();
    installServiceWorkerStub({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
    });
    expect(await getPushSubscriptionState()).toBe('unsubscribed');
  });
});

describe('subscribeToPush', () => {
  it('returns false without prompting when push is unsupported', async () => {
    removeServiceWorkerGlobal();
    removePushManagerGlobal();
    expect(await subscribeToPush()).toBe(false);
  });

  it('returns false and warns when NEXT_PUBLIC_VAPID_PUBLIC_KEY is not set', async () => {
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = '';
    installPushManagerGlobal();
    installServiceWorkerStub();
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(await subscribeToPush()).toBe(false);
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('returns false without subscribing when the user denies permission', async () => {
    installPushManagerGlobal();
    const { pushManager } = installServiceWorkerStub();
    installNotificationStub('denied');

    const result = await subscribeToPush();

    expect(result).toBe(false);
    expect(pushManager.subscribe).not.toHaveBeenCalled();
  });

  it('subscribes with a decoded applicationServerKey and saves it to the backend on success', async () => {
    installPushManagerGlobal();
    const subscriptionObj = {
      endpoint: 'https://push.example.com/abc',
      toJSON: () => ({ endpoint: 'https://push.example.com/abc', keys: {} }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    const { pushManager } = installServiceWorkerStub({
      pushManager: { subscribe: vi.fn().mockResolvedValue(subscriptionObj) },
    });
    installNotificationStub('granted');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    const result = await subscribeToPush();

    expect(result).toBe(true);
    expect(pushManager.subscribe).toHaveBeenCalledTimes(1);
    const callArgs = (pushManager.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(callArgs.userVisibleOnly).toBe(true);
    // The decoded key must be a Uint8Array-backed BufferSource, not the
    // raw base64 string or an empty buffer.
    expect(callArgs.applicationServerKey).toBeInstanceOf(Uint8Array);
    expect((callArgs.applicationServerKey as Uint8Array).length).toBeGreaterThan(0);

    expect(apiClient.post).toHaveBeenCalledWith(
      '/notifications/push-subscriptions',
      subscriptionObj.toJSON(),
    );
    expect(subscriptionObj.unsubscribe).not.toHaveBeenCalled();
  });

  it('decodes the VAPID key deterministically regardless of URL-safe characters', async () => {
    installPushManagerGlobal();
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'AA-_AA'; // contains URL-safe - and _
    const subscriptionObj = {
      toJSON: () => ({}),
      unsubscribe: vi.fn(),
    };
    const { pushManager } = installServiceWorkerStub({
      pushManager: { subscribe: vi.fn().mockResolvedValue(subscriptionObj) },
    });
    installNotificationStub('granted');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await subscribeToPush();

    const callArgs = (pushManager.subscribe as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const decoded = callArgs.applicationServerKey as Uint8Array;
    // 'AA-_AA' -> padded 'AA-_AA==' -> standard b64 'AA+/AA==' -> bytes [0x00, 0x0f, 0xbf, 0x00]
    // (verified independently via Python's base64.b64decode, not hand-computed)
    expect(Array.from(decoded)).toEqual([0x00, 0x0f, 0xbf, 0x00]);
  });

  it('rolls back the browser subscription if saving to the backend fails (PWA-CRITICAL-04)', async () => {
    installPushManagerGlobal();
    const subscriptionObj = {
      toJSON: () => ({ endpoint: 'https://push.example.com/abc' }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    installServiceWorkerStub({
      pushManager: { subscribe: vi.fn().mockResolvedValue(subscriptionObj) },
    });
    installNotificationStub('granted');
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    await expect(subscribeToPush()).rejects.toThrow('network down');
    expect(subscriptionObj.unsubscribe).toHaveBeenCalledTimes(1);
  });

  it('re-reads NEXT_PUBLIC_VAPID_PUBLIC_KEY at call time, not at module-import time (FIX PWA-05)', async () => {
    // Regression guard: subscribeToPush() must read the env var fresh on
    // every call. A module-level `const VAPID_PUBLIC_KEY = process.env...`
    // would freeze whatever value was present when this test *file* first
    // imported lib/pwa.ts — long before this test's beforeEach runs —
    // making every subsequent call silently behave as if the key were
    // missing regardless of what the test sets it to.
    installPushManagerGlobal();
    const subscriptionObj = { toJSON: () => ({}), unsubscribe: vi.fn() };
    installServiceWorkerStub({
      pushManager: { subscribe: vi.fn().mockResolvedValue(subscriptionObj) },
    });
    installNotificationStub('granted');
    (apiClient.post as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    // Deliberately set to a *different* value than beforeEach's default,
    // proving the function isn't relying on an import-time snapshot.
    process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = 'BBBB';

    const result = await subscribeToPush();

    expect(result).toBe(true);
  });

  it('still throws even if the compensating unsubscribe itself fails', async () => {
    installPushManagerGlobal();
    const subscriptionObj = {
      toJSON: () => ({}),
      unsubscribe: vi.fn().mockRejectedValue(new Error('unsubscribe failed too')),
    };
    installServiceWorkerStub({
      pushManager: { subscribe: vi.fn().mockResolvedValue(subscriptionObj) },
    });
    installNotificationStub('granted');
    (apiClient.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    // The original backend-save error should propagate, not the
    // unsubscribe-cleanup error swallowed by .catch(() => undefined).
    await expect(subscribeToPush()).rejects.toThrow('network down');
  });
});

describe('unsubscribeFromPush', () => {
  it('does nothing when push is unsupported', async () => {
    removeServiceWorkerGlobal();
    removePushManagerGlobal();
    await unsubscribeFromPush();
    expect(apiClient.delete).not.toHaveBeenCalled();
  });

  it('does nothing when there is no existing subscription', async () => {
    installPushManagerGlobal();
    installServiceWorkerStub({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(null) },
    });

    await unsubscribeFromPush();

    expect(apiClient.delete).not.toHaveBeenCalled();
  });

  it('unsubscribes locally and tells the backend to drop the record by endpoint', async () => {
    installPushManagerGlobal();
    const subscription = {
      endpoint: 'https://push.example.com/abc',
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    installServiceWorkerStub({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
    });
    (apiClient.delete as ReturnType<typeof vi.fn>).mockResolvedValue({ data: {} });

    await unsubscribeFromPush();

    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
    expect(apiClient.delete).toHaveBeenCalledWith('/notifications/push-subscriptions', {
      data: { endpoint: 'https://push.example.com/abc' },
    });
  });

  it('does not throw if the backend delete fails (local unsubscribe already succeeded)', async () => {
    installPushManagerGlobal();
    const subscription = {
      endpoint: 'https://push.example.com/abc',
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    installServiceWorkerStub({
      pushManager: { getSubscription: vi.fn().mockResolvedValue(subscription) },
    });
    (apiClient.delete as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('network down'));

    await expect(unsubscribeFromPush()).resolves.toBeUndefined();
    expect(subscription.unsubscribe).toHaveBeenCalledTimes(1);
  });
});

describe('registerServiceWorker', () => {
  it('returns null when serviceWorker is not supported', async () => {
    removeServiceWorkerGlobal();
    process.env.NODE_ENV = 'production';
    expect(await registerServiceWorker()).toBeNull();
  });

  it('skips registration in development without the escape hatch', async () => {
    process.env.NODE_ENV = 'development';
    delete process.env.NEXT_PUBLIC_ENABLE_SW_DEV;
    const { swContainer } = installServiceWorkerStub();

    expect(await registerServiceWorker()).toBeNull();
    expect(swContainer.register).not.toHaveBeenCalled();
  });

  it('registers in development when NEXT_PUBLIC_ENABLE_SW_DEV is "true"', async () => {
    process.env.NODE_ENV = 'development';
    process.env.NEXT_PUBLIC_ENABLE_SW_DEV = 'true';
    const { swContainer, registration } = installServiceWorkerStub();

    const result = await registerServiceWorker();

    expect(swContainer.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(result).toBe(registration);
  });

  it('registers successfully in production and returns the registration', async () => {
    process.env.NODE_ENV = 'production';
    const { swContainer, registration } = installServiceWorkerStub();

    const result = await registerServiceWorker();

    expect(swContainer.register).toHaveBeenCalledWith('/sw.js', { scope: '/' });
    expect(result).toBe(registration);
  });

  it('notifies waiting-update listeners immediately if a worker is already waiting', async () => {
    process.env.NODE_ENV = 'production';
    const waitingWorker = { postMessage: vi.fn() };
    installServiceWorkerStub({ extra: { waiting: waitingWorker } });

    const listener = vi.fn();
    const unsubscribe = onServiceWorkerUpdate(listener);

    await registerServiceWorker();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('returns null and does not throw when registration itself rejects', async () => {
    process.env.NODE_ENV = 'production';
    installServiceWorkerStub({ register: vi.fn().mockRejectedValue(new Error('boom')) });
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const result = await registerServiceWorker();

    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalled();
    warnSpy.mockRestore();
  });

  it('notifies listeners once a newly-installing worker reaches "installed" with an existing controller', async () => {
    process.env.NODE_ENV = 'production';
    let statechangeCb: (() => void) | undefined;
    const installingWorker = {
      state: 'installing',
      addEventListener: vi.fn((evt: string, cb: () => void) => {
        if (evt === 'statechange') statechangeCb = cb;
      }),
    };

    let updatefoundCb: (() => void) | undefined;
    const registrationAddEventListener = vi.fn((evt: string, cb: () => void) => {
      if (evt === 'updatefound') updatefoundCb = cb;
    });

    const { swContainer } = installServiceWorkerStub({
      extra: { installing: installingWorker, addEventListener: registrationAddEventListener },
    });
    // Simulate an already-controlled page (i.e. this is an update, not a
    // first install) so the installed->waiting-listener branch fires.
    Object.defineProperty(swContainer, 'controller', { value: {}, configurable: true });

    const listener = vi.fn();
    const unsubscribe = onServiceWorkerUpdate(listener);

    await registerServiceWorker();
    expect(updatefoundCb).toBeDefined();
    updatefoundCb?.();
    expect(installingWorker.addEventListener).toHaveBeenCalledWith('statechange', expect.any(Function));

    installingWorker.state = 'installed';
    statechangeCb?.();

    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
  });

  it('reloads the page exactly once when the controller changes', async () => {
    process.env.NODE_ENV = 'production';
    let controllerchangeCb: (() => void) | undefined;
    const registrationAddEventListener = vi.fn();
    const swAddEventListener = vi.fn((evt: string, cb: () => void) => {
      if (evt === 'controllerchange') controllerchangeCb = cb;
    });

    const pushManager = { getSubscription: vi.fn().mockResolvedValue(null), subscribe: vi.fn() };
    const registration = { pushManager, waiting: null, installing: null, addEventListener: registrationAddEventListener };
    const swContainer = {
      ready: Promise.resolve(registration),
      register: vi.fn().mockResolvedValue(registration),
      controller: null,
      addEventListener: swAddEventListener,
    };
    Object.defineProperty(window.navigator, 'serviceWorker', { value: swContainer, configurable: true });

    const reloadSpy = vi.fn();
    const originalLocation = window.location;
    // @ts-expect-error jsdom location is configurable enough for this stub
    delete window.location;
    // @ts-expect-error partial Location stub sufficient for this test
    window.location = { ...originalLocation, reload: reloadSpy };

    await registerServiceWorker();
    expect(controllerchangeCb).toBeDefined();

    controllerchangeCb?.();
    controllerchangeCb?.(); // a second event must not trigger a second reload

    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // @ts-expect-error restore
    window.location = originalLocation;
  });
});

describe('onServiceWorkerUpdate', () => {
  it('returns an unsubscribe function that stops future notifications', async () => {
    process.env.NODE_ENV = 'production';
    const waitingWorker = { postMessage: vi.fn() };
    const { registration } = installServiceWorkerStub({ extra: { waiting: waitingWorker } });

    const listener = vi.fn();
    const unsubscribe = onServiceWorkerUpdate(listener);
    unsubscribe();

    await registerServiceWorker();

    expect(listener).not.toHaveBeenCalled();
    void registration;
  });

  it('supports multiple independent listeners', async () => {
    process.env.NODE_ENV = 'production';
    const waitingWorker = { postMessage: vi.fn() };
    installServiceWorkerStub({ extra: { waiting: waitingWorker } });

    const listenerA = vi.fn();
    const listenerB = vi.fn();
    const unsubA = onServiceWorkerUpdate(listenerA);
    const unsubB = onServiceWorkerUpdate(listenerB);

    await registerServiceWorker();

    expect(listenerA).toHaveBeenCalledTimes(1);
    expect(listenerB).toHaveBeenCalledTimes(1);
    unsubA();
    unsubB();
  });
});

describe('activateWaitingServiceWorker', () => {
  it('posts SKIP_WAITING to the waiting worker', () => {
    const waiting = { postMessage: vi.fn() };
    activateWaitingServiceWorker({ waiting } as unknown as ServiceWorkerRegistration);
    expect(waiting.postMessage).toHaveBeenCalledWith({ type: 'SKIP_WAITING' });
  });

  it('does not throw when there is no waiting worker', () => {
    expect(() =>
      activateWaitingServiceWorker({ waiting: null } as unknown as ServiceWorkerRegistration),
    ).not.toThrow();
  });
});
