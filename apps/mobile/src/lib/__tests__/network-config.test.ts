import { afterEach, describe, expect, it, vi } from 'vitest';

const netInfo = vi.hoisted(() => ({ configure: vi.fn() }));

vi.mock('@react-native-community/netinfo', () => ({ default: netInfo }));

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
  netInfo.configure.mockReset();
});

describe('native network reachability', () => {
  it('uses the lightweight health route and does not confuse server errors with no internet', async () => {
    vi.stubEnv('EXPO_PUBLIC_API_URL', 'https://api.marketplat.test');
    await import('../network-config');

    expect(netInfo.configure).toHaveBeenCalledTimes(1);
    const options = netInfo.configure.mock.calls[0]?.[0] as {
      reachabilityUrl: string;
      reachabilityTest: (response: Response) => boolean;
      useNativeReachability: boolean;
    };
    expect(options.reachabilityUrl).toBe('https://api.marketplat.test/health');
    expect(options.useNativeReachability).toBe(false);
    await expect(options.reachabilityTest({ status: 503 } as Response)).resolves.toBe(true);
    await expect(options.reachabilityTest({ status: 429 } as Response)).resolves.toBe(true);
    await expect(options.reachabilityTest({ status: 0 } as Response)).resolves.toBe(false);
  });
});
