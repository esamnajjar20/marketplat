import { prisma } from '../../src/config/prisma';
import { StoreDetails, StoreStatus } from '@prisma/client';

// STORE-SLUG: `slug` is a required, unique column on store_details as
// of Foundation v1 — this helper previously didn't set it at all,
// which would fail schema validation now. Generates a slug the same
// way storesService.createStore does (base name + random suffix,
// unconditionally — a test helper doesn't need the collision-retry
// loop the real service uses, a single random suffix per call is
// already unique enough for test data).
let testStoreSlugCounter = 0;
const testSlug = (name: string): string => {
  testStoreSlugCounter += 1;
  const base = name
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '-')
    .replace(/^-+|-+$/g, '');
  return `${base || 'store'}-${testStoreSlugCounter}-${Math.random().toString(36).slice(2, 6)}`;
};

export const createTestStore = async (
  sellerProfileId: string,
  overrides?: Partial<{
    name: string;
    description: string;
    city: string;
    address: string;
    phone: string;
    status: StoreStatus;
    slug: string;
  }>
): Promise<StoreDetails> => {
  const name = overrides?.name ?? 'Test Store';
  return prisma.storeDetails.create({
    data: {
      sellerProfileId,
      name,
      slug: overrides?.slug ?? testSlug(name),
      description: overrides?.description ?? 'A perfectly fine store description here',
      city: overrides?.city ?? 'غزة',
      address: overrides?.address,
      phone: overrides?.phone ?? '0599111222',
      status: overrides?.status ?? 'ACTIVE',
    },
  });
};
