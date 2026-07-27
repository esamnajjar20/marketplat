import { prisma } from '../../src/config/prisma';
import { adsRepository } from '../../src/modules/ads/ads.repository';
import { createTestUser } from '../helpers/auth.helper';
import { createTestAd } from '../helpers/ad.helper';

describe('adsRepository.addImages — ordering (report item #12)', () => {
  it('appends new images after existing ones, preserving both orders', async () => {
    const user = await createTestUser();
    const ad = await createTestAd(user.id);

    await prisma.ad.update({ where: { id: ad.id }, data: { images: ['existing-1', 'existing-2'] } });

    const updated = await adsRepository.addImages(ad.id, ['new-1', 'new-2'], 10);

    expect(updated.images).toEqual(['existing-1', 'existing-2', 'new-1', 'new-2']);
  });

  it('preserves the original order of existing images (not reordered)', async () => {
    const user = await createTestUser();
    const ad = await createTestAd(user.id);

    await prisma.ad.update({
      where: { id: ad.id },
      data: { images: ['first', 'second', 'third'] },
    });

    const updated = await adsRepository.addImages(ad.id, ['fourth'], 10);

    expect(updated.images).toEqual(['first', 'second', 'third', 'fourth']);
  });

  it('preserves the upload order of newly-added images', async () => {
    const user = await createTestUser();
    const ad = await createTestAd(user.id);

    const updated = await adsRepository.addImages(ad.id, ['a', 'b', 'c', 'd'], 10);

    expect(updated.images).toEqual(['a', 'b', 'c', 'd']);
  });

  it('caps total images at maxImages, keeping existing images over new ones on overflow', async () => {
    const user = await createTestUser();
    const ad = await createTestAd(user.id);

    await prisma.ad.update({
      where: { id: ad.id },
      data: { images: ['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8'] }, // 8 existing
    });

    // Adding 4 more with a max of 10 should keep all 8 existing + only 2 new.
    const updated = await adsRepository.addImages(ad.id, ['n1', 'n2', 'n3', 'n4'], 10);

    expect(updated.images).toHaveLength(10);
    expect(updated.images).toEqual(['e1', 'e2', 'e3', 'e4', 'e5', 'e6', 'e7', 'e8', 'n1', 'n2']);
  });

  it('never drops an existing image to make room for a new one', async () => {
    const user = await createTestUser();
    const ad = await createTestAd(user.id);

    const existing = Array.from({ length: 10 }, (_, i) => `existing-${i}`);
    await prisma.ad.update({ where: { id: ad.id }, data: { images: existing } });

    // Already at the cap — adding new images should change nothing.
    const updated = await adsRepository.addImages(ad.id, ['should-not-appear'], 10);

    expect(updated.images).toEqual(existing);
    expect(updated.images).not.toContain('should-not-appear');
  });

  it('produces a stable, identical order across repeated calls with the same inputs', async () => {
    const user = await createTestUser();
    const ad = await createTestAd(user.id);

    await prisma.ad.update({ where: { id: ad.id }, data: { images: ['base-1', 'base-2'] } });

    const firstCall  = await adsRepository.addImages(ad.id, ['x1'], 10);
    const secondAd   = await prisma.ad.findUniqueOrThrow({ where: { id: ad.id } });

    // Re-running addImages with a fresh new image should not perturb the
    // order of what's already there.
    const secondCall = await adsRepository.addImages(ad.id, ['x2'], 10);

    expect(firstCall.images).toEqual(['base-1', 'base-2', 'x1']);
    expect(secondAd.images).toEqual(['base-1', 'base-2', 'x1']);
    expect(secondCall.images).toEqual(['base-1', 'base-2', 'x1', 'x2']);
  });

  it('handles an ad with no existing images (pure append)', async () => {
    const user = await createTestUser();
    const ad = await createTestAd(user.id); // images: []

    const updated = await adsRepository.addImages(ad.id, ['only-1', 'only-2'], 10);

    expect(updated.images).toEqual(['only-1', 'only-2']);
  });
});
