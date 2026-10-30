import {
  getCachedUserProfile,
  getCachedUserProfileWithStatus,
  getUserProfileCacheKeysForTests,
  invalidateCachedUserProfile,
} from '../../src/shared/utils/userProfileCache';

describe('userProfileCache', () => {
  it('isolates values by user id and reuses a fresh per-user Redis entry', async () => {
    const buildA = jest.fn().mockResolvedValue({ id: 'u1', name: 'A' });
    const buildB = jest.fn().mockResolvedValue({ id: 'u2', name: 'B' });

    await expect(getCachedUserProfile('u1', buildA)).resolves.toEqual({ id: 'u1', name: 'A' });
    await expect(getCachedUserProfile('u1', buildA)).resolves.toEqual({ id: 'u1', name: 'A' });
    await expect(getCachedUserProfile('u2', buildB)).resolves.toEqual({ id: 'u2', name: 'B' });

    expect(buildA).toHaveBeenCalledTimes(1);
    expect(buildB).toHaveBeenCalledTimes(1);
    expect(getUserProfileCacheKeysForTests('u1').key).not.toBe(
      getUserProfileCacheKeysForTests('u2').key
    );
  });

  it('reports Redis MISS then HIT for the same user profile', async () => {
    const build = jest.fn().mockResolvedValue({ id: 'u-status', name: 'Status' });

    await expect(getCachedUserProfileWithStatus('u-status', build)).resolves.toMatchObject({
      value: { id: 'u-status', name: 'Status' },
      status: 'miss',
    });
    await expect(getCachedUserProfileWithStatus('u-status', build)).resolves.toMatchObject({
      value: { id: 'u-status', name: 'Status' },
      status: 'hit',
    });
    expect(build).toHaveBeenCalledTimes(1);
  });

  it('hard-invalidates only the selected user profile generation', async () => {
    const buildBefore = jest.fn().mockResolvedValue({ id: 'u1', name: 'before' });
    await getCachedUserProfile('u1', buildBefore);
    await invalidateCachedUserProfile('u1');

    const buildAfter = jest.fn().mockResolvedValue({ id: 'u1', name: 'after' });
    await expect(getCachedUserProfile('u1', buildAfter)).resolves.toEqual({ id: 'u1', name: 'after' });
    expect(buildAfter).toHaveBeenCalledTimes(1);
  });
});
