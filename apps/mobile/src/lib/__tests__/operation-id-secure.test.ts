import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-crypto', () => ({
  getRandomBytes: vi.fn((length: number) => Uint8Array.from({ length }, (_, i) => i + 1)),
}));

import { createMobileOperationId, secureRandomToken } from '../operation-id';

describe('secure operation ids', () => {
  it('uses the platform CSPRNG (expo-crypto) and never Math.random when it is available', () => {
    const spy = vi.spyOn(Math, 'random');
    expect(secureRandomToken(8)).toBe('0102030405060708');
    expect(createMobileOperationId('fav')).toMatch(/^fav-\d+-0102030405060708$/);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it('produces ids accepted by the backend operation-id pattern', () => {
    expect(createMobileOperationId('chat message')).toMatch(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/);
  });
});
