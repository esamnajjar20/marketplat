import { adsRepository } from '../../src/modules/ads/ads.repository';
import { createTestUser } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';
import { prisma } from '../../src/config/prisma';
import { AdStatus } from '@prisma/client';

/**
 * FIX TEST-V4-07: ads.repository.ts's status-filter scoping had no
 * dedicated test coverage. Two distinct guarantees matter here:
 *
 * 1. findMany (the PUBLIC /ads listing) must never show DELETED or SOLD
 *    ads regardless of what query params are passed — this is hardcoded,
 *    not user-controllable.
 *
 * 2. findManyByUserId (GET /ads/me) accepts an optional status filter
 *    that DOES include DELETED — this was a deliberate decision (see
 *    ads.validation.ts's FIX D-24 comments): since this query is always
 *    scoped to the authenticated user's own ads, seeing your own deleted
 *    ads isn't a cross-user leak. The thing that must never happen is
 *    that scoping breaking down — userId must always be the actual
 *    caller's id baked into the WHERE clause, never influenced by the
 *    statusFilter value itself.
 */
describe('adsRepository — status filter scoping (FIX TEST-V4-07)', () => {
  describe('findMany (public listing)', () => {
    it('never returns a DELETED ad, even though no caller-supplied filter requests it', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);
      await prisma.ad.update({ where: { id: ad.id }, data: { status: AdStatus.DELETED } });

      const { ads } = await adsRepository.findMany({ page: 1, limit: 20 });

      expect(ads.find(a => a.id === ad.id)).toBeUndefined();
    });

    it('never returns a SOLD ad in the default public listing', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);
      await prisma.ad.update({ where: { id: ad.id }, data: { status: AdStatus.SOLD } });

      const { ads } = await adsRepository.findMany({ page: 1, limit: 20 });

      expect(ads.find(a => a.id === ad.id)).toBeUndefined();
    });

    it('returns an ACTIVE ad normally', async () => {
      const user = await createTestUser();
      const ad = await createTestAd(user.id);

      const { ads } = await adsRepository.findMany({ page: 1, limit: 20 });

      expect(ads.find(a => a.id === ad.id)).toBeDefined();
    });
  });

  describe('findManyByUserId (GET /ads/me)', () => {
    it('with no statusFilter, returns ACTIVE and SOLD but not DELETED', async () => {
      const user = await createTestUser();
      const activeAd  = await createTestAd(user.id, { title: 'Active ad title here' });
      const soldAd    = await createTestAd(user.id, { title: 'Sold ad title here' });
      const deletedAd = await createTestAd(user.id, { title: 'Deleted ad title here' });
      await prisma.ad.update({ where: { id: soldAd.id }, data: { status: AdStatus.SOLD } });
      await prisma.ad.update({ where: { id: deletedAd.id }, data: { status: AdStatus.DELETED } });

      const { ads } = await adsRepository.findManyByUserId(user.id, { page: 1, limit: 20 });
      const ids = ads.map(a => a.id);

      expect(ids).toContain(activeAd.id);
      expect(ids).toContain(soldAd.id);
      expect(ids).not.toContain(deletedAd.id);
    });

    it('with statusFilter=DELETED, returns only the caller\'s own deleted ads', async () => {
      const user = await createTestUser();
      const activeAd  = await createTestAd(user.id, { title: 'Active ad title here' });
      const deletedAd = await createTestAd(user.id, { title: 'Deleted ad title here' });
      await prisma.ad.update({ where: { id: deletedAd.id }, data: { status: AdStatus.DELETED } });

      const { ads } = await adsRepository.findManyByUserId(user.id, {
        page: 1, limit: 20, statusFilter: AdStatus.DELETED,
      });
      const ids = ads.map(a => a.id);

      expect(ids).toEqual([deletedAd.id]);
      expect(ids).not.toContain(activeAd.id);
    });

    it('SECURITY: never returns another user\'s ads, even when that user has a DELETED ad and the same statusFilter is requested', async () => {
      const userA = await createTestUser();
      const userB = await createTestUser();
      const userBsDeletedAd = await createTestAd(userB.id, { title: 'User B deleted ad title' });
      await prisma.ad.update({ where: { id: userBsDeletedAd.id }, data: { status: AdStatus.DELETED } });

      const { ads } = await adsRepository.findManyByUserId(userA.id, {
        page: 1, limit: 20, statusFilter: AdStatus.DELETED,
      });

      expect(ads.find(a => a.id === userBsDeletedAd.id)).toBeUndefined();
    });

    it('with statusFilter=ACTIVE, excludes the same user\'s SOLD and DELETED ads', async () => {
      const user = await createTestUser();
      const activeAd  = await createTestAd(user.id, { title: 'Active ad title here' });
      const soldAd    = await createTestAd(user.id, { title: 'Sold ad title here' });
      await prisma.ad.update({ where: { id: soldAd.id }, data: { status: AdStatus.SOLD } });

      const { ads } = await adsRepository.findManyByUserId(user.id, {
        page: 1, limit: 20, statusFilter: AdStatus.ACTIVE,
      });
      const ids = ads.map(a => a.id);

      expect(ids).toEqual([activeAd.id]);
      expect(ids).not.toContain(soldAd.id);
    });

    it('total count matches the filtered set, not the user\'s total ad count', async () => {
      const user = await createTestUser();
      await createTestAd(user.id, { title: 'Active ad number one' });
      const soldAd = await createTestAd(user.id, { title: 'Sold ad title here' });
      await prisma.ad.update({ where: { id: soldAd.id }, data: { status: AdStatus.SOLD } });

      const { total } = await adsRepository.findManyByUserId(user.id, {
        page: 1, limit: 20, statusFilter: AdStatus.SOLD,
      });

      expect(total).toBe(1);
    });
  });
});
