import { vi } from 'vitest';

// React Native's package entrypoint contains Flow-only `import typeof` syntax.
// Vitest/Rollup runs in Node and cannot parse that entrypoint. Keep this mock
// deliberately small; individual tests can provide richer native-module mocks.
vi.mock('react-native', () => ({
  Platform: {
    OS: 'android',
    select: (values: Record<string, unknown>) => values.android ?? values.native ?? values.default,
  },
  Share: { share: vi.fn(async () => ({ action: 'sharedAction' })) },
}));

// expo@58.0.19's ImportMetaRegistry.js imports a missing getBundleUrl, so any
// module that transitively imports `expo` fails to load. Mock the specific
// expo modules used by the app; tests that need other behavior can override.
vi.mock('expo', () => ({}));
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
