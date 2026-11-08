import { vi } from 'vitest';

// 1. React Native's package entrypoint contains Flow-only `import typeof` syntax.
// Vitest/Rollup runs in Node and cannot parse that entrypoint.
vi.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: (values: Record<string, unknown>) => values.android ?? values.native ?? values.default,
  },
  Share: { share: vi.fn(async () => ({ action: 'sharedAction' })) },
}));

// 2. Polyfill globalThis.expo (required by expo-modules-core).
// Keep the test-only global typed without weakening TypeScript strictness.
type ExpoTestGlobal = typeof globalThis & {
  expo?: Record<string, unknown>;
};
const expoTestGlobal = globalThis as ExpoTestGlobal;

if (!expoTestGlobal.expo) {
  expoTestGlobal.expo = {
    EventEmitter: class {
      addListener() { return { remove: () => {} }; }
      removeAllListeners() {}
      emit() {}
    },
    NativeModulesProxy: {},
  };
}

// 3. Mock core Expo and native module loaders
vi.mock('expo', async (importOriginal) => {
  const actual = await importOriginal<typeof import('expo')>().catch(() => ({}));
  return {
    ...actual,
    requireNativeModule: vi.fn(() => ({})),
    requireOptionalNativeModule: vi.fn(() => ({})),
  };
});

vi.mock('expo-modules-core', () => {
  const mockNativeModule = new Proxy({}, { get: () => () => {} });
  return {
    requireNativeModule: vi.fn(() => mockNativeModule),
    requireOptionalNativeModule: vi.fn(() => mockNativeModule),
    NativeModulesProxy: mockNativeModule,
    EventEmitter: class {
      addListener() { return { remove: () => {} }; }
      removeAllListeners() {}
      emit() {}
    },
  };
});

// 4. Mock expo-asset to prevent loading missing 'ExpoAsset' native module
vi.mock('expo-asset', () => {
  class Asset {
    static loadAsync = vi.fn(async () => []);
    static fromModule = vi.fn(() => new Asset());
    static fromURI = vi.fn(() => new Asset());
    downloadAsync = vi.fn(async () => undefined);
    localUri = 'file:///test-asset.png';
    uri = 'file:///test-asset.png';
  }
  return { Asset };
});

// 5. Mock other Expo modules used by the app
vi.mock('expo-constants', () => ({
  default: { expoConfig: {} },
  ExecutionEnvironment: { Bare: 'bare', Standalone: 'standalone', StoreClient: 'store-client' },
}));

vi.mock('expo-file-system', () => ({
  documentDirectory: 'file:///test-documents/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  deleteAsync: vi.fn(async () => undefined),
  makeDirectoryAsync: vi.fn(async () => undefined),
  readDirectoryAsync: vi.fn(async () => []),
  downloadAsync: vi.fn(async (_url: string, dest: string) => ({ uri: dest, status: 200 })),
  readAsStringAsync: vi.fn(async () => ''),
  writeAsStringAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-file-system/legacy', () => ({
  documentDirectory: 'file:///test-documents/',
  getInfoAsync: vi.fn(async () => ({ exists: false })),
  deleteAsync: vi.fn(async () => undefined),
  makeDirectoryAsync: vi.fn(async () => undefined),
  readDirectoryAsync: vi.fn(async () => []),
  downloadAsync: vi.fn(async (_url: string, dest: string) => ({ uri: dest, status: 200 })),
  readAsStringAsync: vi.fn(async () => ''),
  writeAsStringAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-secure-store', () => ({
  getItemAsync: vi.fn(async () => null),
  setItemAsync: vi.fn(async () => undefined),
  deleteItemAsync: vi.fn(async () => undefined),
  WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'when-unlocked-this-device-only',
}));

vi.mock('expo-device', () => ({
  isDevice: true,
  osName: 'Android',
  modelName: 'test',
  brand: 'test',
}));

vi.mock('expo-notifications', () => ({
  setNotificationHandler: vi.fn(),
  addNotificationReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  addNotificationResponseReceivedListener: vi.fn(() => ({ remove: vi.fn() })),
  getPermissionsAsync: vi.fn(async () => ({ status: 'denied' })),
  requestPermissionsAsync: vi.fn(async () => ({ status: 'denied' })),
  getDevicePushTokenAsync: vi.fn(async () => ({ type: 'fcm', data: 'token' })),
  getExpoPushTokenAsync: vi.fn(async () => ({ data: 'token' })),
  AndroidImportance: { MAX: 5, HIGH: 4 },
  setNotificationChannelAsync: vi.fn(async () => undefined),
}));

vi.mock('expo-linking', () => ({
  createURL: vi.fn((p: string) => `marketplat://${p}`),
  parse: vi.fn(() => ({})),
}));

vi.mock('expo-application', () => ({
  applicationId: 'com.marketplat.mobile',
  nativeApplicationVersion: '0.1.1',
}));

// Mock expo-crypto to prevent native module dependency issues
vi.mock('expo-crypto', () => {
  class SealedData {
    static fromParts = vi.fn();
    static fromCombined = vi.fn();
    combined = vi.fn();
  }
  return {
    digestStringAsync: vi.fn(async () => 'mocked-hash'),
    getRandomBytesAsync: vi.fn(async (len: number) => new Uint8Array(len)),
    randomUUID: vi.fn(() => '00000000-0000-4000-8000-000000000000'),
    CryptoDigestAlgorithm: { SHA256: 'SHA-256', SHA512: 'SHA-512' },
    CryptoEncoding: { HEX: 'hex', BASE64: 'base64' },
  };
});
