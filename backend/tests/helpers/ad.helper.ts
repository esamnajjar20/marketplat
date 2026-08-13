import { prisma } from '../../src/config/prisma';
import { Ad } from '@prisma/client';

export const createTestAd = async (
  userId: string,
  overrides?: Partial<{
    title: string;
    description: string;
    price: number;
    city: string;
    categoryId: string;
    views: number;
  }>
): Promise<Ad> => {
  // Real ad creation always attaches a SellerProfile (ads.service.ts's
  // createAd calls sellersService.ensureSellerProfileForAdCreation
  // before ever inserting the Ad row). ads.repository.ts's public
  // findMany filters on `sellerProfile: { suspended: false }` — a
  // nested to-one relation condition that Prisma never matches when
  // the relation is null — so an ad created without one is silently
  // invisible to every public listing/search query even though it's
  // ACTIVE. Upsert keeps this helper idempotent across the multiple
  // createTestAd calls a single test file often makes for one user.
  //
  // RACE-FIX: several tests call createTestAd multiple times for the
  // same user inside Promise.all (e.g. seeding several ads at once for
  // a pagination test). Prisma's upsert is a read-then-write, not a
  // single atomic statement — two concurrent upserts for the same
  // userId can both see "no row yet" and both attempt create, so the
  // loser hits a unique constraint violation (P2002) on userId instead
  // of transparently falling back to the winner's row. Catch that one
  // specific case and re-read the now-existing row instead of failing
  // the whole test.
  let sellerProfile;
  try {
    sellerProfile = await prisma.sellerProfile.upsert({
      where: { userId },
      create: { userId, displayName: 'Test Seller', suspended: false, verified: false },
      update: {},
    });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      sellerProfile = await prisma.sellerProfile.findUniqueOrThrow({ where: { userId } });
    } else {
      throw err;
    }
  }

  return prisma.ad.create({
    data: {
      title: overrides?.title ?? 'Test Ad Title',
      description: overrides?.description ?? 'Test ad description with enough characters here',
      price: overrides?.price ?? 100,
      images: [],
      city: overrides?.city ?? 'الرياض',
      userId,
      sellerProfileId: sellerProfile.id,
      ...(overrides?.categoryId && { categoryId: overrides.categoryId }),
      ...(overrides?.views !== undefined && { views: overrides.views }),
    },
  });
};
