/**
 * E2E test-data seed script — NOT run in production, NOT part of the
 * normal server startup path. Exists solely so the frontend's
 * Playwright suite (marketplace-v10/e2e) can set up state the UI has
 * no legitimate path to create itself — most importantly, an ADMIN
 * user. There is deliberately no self-serve "become an admin" flow in
 * this app (see admin.middleware.ts / AdminUsersTable's role-change
 * flow, which only another admin can trigger), so E2E's admin-flow
 * tests need a database-level seed instead.
 *
 * SAFETY: refuses to run unless DATABASE_URL contains "test" or
 * "e2e" (case-insensitive) in the database name. This is the only
 * guard standing between "seed script for a throwaway test DB" and
 * "wipes/inserts fake data into whatever DATABASE_URL happens to be
 * configured" — treat it as load-bearing, not a formality. A CI
 * pipeline or local .env.e2e should point DATABASE_URL at a database
 * named e.g. `classifieds_e2e`, never at a shared dev/staging DB.
 *
 * Usage (from backend-v9/):
 *   npm run build && DATABASE_URL=postgresql://...@localhost:5432/classifieds_e2e node dist/scripts/seedE2E.js
 *
 * Idempotent: safe to run before every E2E suite run. Upserts by the
 * , well-known identifiers below rather than inserting blindly,
 * so re-running doesn't create duplicate categories/admin users or
 * fail on unique-constraint conflicts from a previous run.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../../shared/utils/hash';

const prisma = new PrismaClient();

const DB_NAME_SAFETY_PATTERN = /test|e2e/i;

// , well-known credentials — E2E tests reference these directly
// (see e2e/on the frontend side, which MUST be
// kept in sync with the literals here). Never used outside a
// throwaway E2E database, so there's no real secret to protect.
export const E2E_ADMIN_EMAIL = 'e2e-admin@example.test';
export const E2E_ADMIN_PASSWORD = 'E2eAdminPass123!';

// A minimal, category tree — enough for AdForm's category
// <select> (parent + one child, exercising the optgroup rendering) and
// CategoryGrid's icon-matching rules (see CategoryGrid.test.tsx) without
// seeding all 8+ real production categories.
const E2E_CATEGORIES = [
  {
    name: 'Vehicles',
    nameAr: 'مركبات',
    slug: 'e2e-vehicles',
    children: [{ name: 'Cars', nameAr: 'سيارات', slug: 'e2e-cars' }],
  },
  {
    name: 'Real Estate',
    nameAr: 'عقارات',
    slug: 'e2e-real-estate',
    children: [],
  },
];

async function assertSafeDatabase(): Promise<void> {
  // CENTRALIZE-04: deliberately process.env, not config/env.ts. This
  // script's own usage comment above runs it as
  // `DATABASE_URL=... node dist/scripts/seedE2E.js` with only
  // DATABASE_URL set — importing env.ts would additionally require
  // JWT_SECRET/JWT_REFRESH_SECRET (min 32 chars each, no defaults) to
  // be present in that same shell or the script fails at import time
  // before this safety check even runs. Same class of exception as
  // instrument.ts's own documented reason for bypassing env.ts.
  const url = process.env.DATABASE_URL ?? '';
  const dbNameMatch = url.match(/\/([^/?]+)(\?|$)/);
  const dbName = dbNameMatch?.[1] ?? '';

  if (!DB_NAME_SAFETY_PATTERN.test(dbName)) {
    throw new Error(
      `Refusing to seed: DATABASE_URL's database name ("${dbName}") does not ` +
        `contain "test" or "e2e". This script is only safe to run against a ` +
        `throwaway E2E database — point DATABASE_URL at one (e.g. ` +
        `classifieds_e2e) before running this.`
    );
  }
}

async function seedAdmin(): Promise<void> {
  const passwordHash = await hashPassword(E2E_ADMIN_PASSWORD);

  await prisma.user.upsert({
    where: { email: E2E_ADMIN_EMAIL },
    update: { role: 'ADMIN', isActive: true, passwordHash, emailVerified: true, emailVerifiedAt: new Date() },
    create: {
      name: 'E2E Admin',
      email: E2E_ADMIN_EMAIL,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
      emailVerified: true,
      emailVerifiedAt: new Date(),
    },
  });

  // eslint-disable-next-line no-console
  console.log(`[seedE2E] admin user ready: ${E2E_ADMIN_EMAIL}`);
}

async function seedCategories(): Promise<void> {
  for (const cat of E2E_CATEGORIES) {
    const parent = await prisma.category.upsert({
      where: { slug: cat.slug },
      update: { name: cat.name, nameAr: cat.nameAr },
      create: { name: cat.name, nameAr: cat.nameAr, slug: cat.slug },
    });

    for (const child of cat.children) {
      await prisma.category.upsert({
        where: { slug: child.slug },
        update: { name: child.name, nameAr: child.nameAr, parentId: parent.id },
        create: {
          name: child.name,
          nameAr: child.nameAr,
          slug: child.slug,
          parentId: parent.id,
        },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[seedE2E] ${E2E_CATEGORIES.length} top-level categories ready`);
}



export const E2E_USER_EMAIL = 'e2e-buyer@example.test';
export const E2E_USER_PASSWORD = 'E2eBuyerPass123!';
export const E2E_SELLER_EMAIL = 'e2e-seller@example.test';
export const E2E_SELLER_PASSWORD = 'E2eSellerPass123!';

async function seedRealMarketplaceFixtures(): Promise<void> {
  const passwordHash = await hashPassword(E2E_USER_PASSWORD);
  const buyer = await prisma.user.upsert({
    where: { email: E2E_USER_EMAIL },
    update: {
      name: 'E2E Buyer', passwordHash, role: 'USER', isActive: true,
      emailVerified: true, emailVerifiedAt: new Date(), city: 'نابلس',
    },
    create: {
      id: 'e2e-buyer-user', name: 'E2E Buyer', email: E2E_USER_EMAIL,
      passwordHash, role: 'USER', isActive: true,
      emailVerified: true, emailVerifiedAt: new Date(), city: 'نابلس',
    },
  });

  const sellerPasswordHash = await hashPassword(E2E_SELLER_PASSWORD);
  const seller = await prisma.user.upsert({
    where: { email: E2E_SELLER_EMAIL },
    update: {
      name: 'E2E Seller', passwordHash: sellerPasswordHash, role: 'USER',
      isActive: true, emailVerified: true, emailVerifiedAt: new Date(), city: 'نابلس',
    },
    create: {
      id: 'e2e-seller-user', name: 'E2E Seller', email: E2E_SELLER_EMAIL,
      passwordHash: sellerPasswordHash, role: 'USER', isActive: true,
      emailVerified: true, emailVerifiedAt: new Date(), city: 'نابلس',
    },
  });

  const sellerProfile = await prisma.sellerProfile.upsert({
    where: { userId: seller.id },
    update: {
      displayName: 'E2E Seller', verified: true,
      verificationStatus: 'VERIFIED', suspended: false,
    },
    create: {
      userId: seller.id, displayName: 'E2E Seller', verified: true,
      verificationStatus: 'VERIFIED', suspended: false,
    },
  });

  const carCategory = await prisma.category.findUniqueOrThrow({ where: { slug: 'e2e-cars' } });
  await prisma.ad.upsert({
    where: { offlineOperationId: 'e2e-seeded-ad-v1' },
    update: {
      title: 'E2E سيارة اختبار للبيع', description: 'إعلان اختبار حقيقي لرحلات Playwright.',
      price: 250, images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'], city: 'نابلس', status: 'ACTIVE',
      userId: seller.id, categoryId: carCategory.id, sellerProfileId: sellerProfile.id,
    },
    create: {
      id: 'e2e-seeded-ad', offlineOperationId: 'e2e-seeded-ad-v1',
      title: 'E2E سيارة اختبار للبيع', description: 'إعلان اختبار حقيقي لرحلات Playwright.',
      price: 250, images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'], city: 'نابلس', condition: 'USED', status: 'ACTIVE',
      userId: seller.id, categoryId: carCategory.id, sellerProfileId: sellerProfile.id,
    },
  });

  // Product form fixture: store and category are real database rows, not API stubs.
  await prisma.storeType.upsert({
    where: { id: 'st_general' },
    update: { isActive: true },
    create: {
      id: 'st_general', slug: 'general', nameAr: 'عام', icon: 'Store',
      labels: { products: 'المنتجات', product: 'منتج', addProduct: 'أضف منتجًا', categories: 'التصنيفات' },
      presentation: {}, freeProductLimit: 20, isActive: true,
    },
  });
  const store = await prisma.storeDetails.upsert({
    where: { sellerProfileId: sellerProfile.id },
    update: {
      name: 'متجر اختبار E2E', description: 'متجر مخصص لاختبارات E2E الحقيقية.',
      city: 'نابلس', phone: '+970599123456', status: 'ACTIVE', storeTypeId: 'st_general',
    },
    create: {
      id: 'e2e-store-details', sellerProfileId: sellerProfile.id, storeTypeId: 'st_general',
      name: 'متجر اختبار E2E', slug: 'e2e-seller-store',
      description: 'متجر مخصص لاختبارات E2E الحقيقية.', city: 'نابلس',
      phone: '+970599123456', status: 'ACTIVE', plan: 'FREE',
    },
  });
  const productCategory = await prisma.productCategory.upsert({
    where: { slug: 'e2e-products' },
    update: { name: 'E2E Products', nameAr: 'منتجات اختبار E2E', isActive: true, storeTypeId: 'st_general' },
    create: {
      name: 'E2E Products', nameAr: 'منتجات اختبار E2E', slug: 'e2e-products',
      isActive: true, storeTypeId: 'st_general',
    },
  });
  await prisma.product.upsert({
    where: { offlineOperationId: 'e2e-seeded-product-v1' },
    update: {
      storeId: store.id, categoryId: productCategory.id, name: 'E2E منتج اختبار',
      description: 'منتج حقيقي في قاعدة بيانات E2E لاختبار المفضلة والتفاصيل.',
      images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'], price: 35, status: 'ACTIVE', availability: 'IN_STOCK',
    },
    create: {
      id: 'e2e-seeded-product', offlineOperationId: 'e2e-seeded-product-v1',
      storeId: store.id, categoryId: productCategory.id, name: 'E2E منتج اختبار',
      description: 'منتج حقيقي في قاعدة بيانات E2E لاختبار المفضلة والتفاصيل.',
      images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'], price: 35, status: 'ACTIVE', availability: 'IN_STOCK',
    },
  });

  // Service creation fixture: real provider/type/category rows for the service form.
  const serviceType = await prisma.serviceType.upsert({
    where: { slug: 'e2e-general-service' },
    update: { name: 'E2E General Service', nameAr: 'خدمات اختبار E2E', isActive: true },
    create: {
      id: 'e2e-service-type', slug: 'e2e-general-service', name: 'E2E General Service',
      nameAr: 'خدمات اختبار E2E', icon: 'Wrench', isActive: true,
      labels: {}, capabilities: {}, presentation: {}, sortOrder: 999,
    },
  });
  const serviceCategory = await prisma.serviceCategory.upsert({
    where: { slug: 'e2e-service-category' },
    update: { name: 'E2E Service Category', nameAr: 'خدمات اختبار', serviceTypeId: serviceType.id, isActive: true },
    create: {
      name: 'E2E Service Category', nameAr: 'خدمات اختبار', slug: 'e2e-service-category',
      serviceTypeId: serviceType.id, isActive: true,
    },
  });
  const provider = await prisma.serviceProviderDetails.upsert({
    where: { sellerProfileId: sellerProfile.id },
    update: {
      businessName: 'E2E Service Provider', description: 'مقدم خدمات للاختبارات الحقيقية.',
      serviceAreaCities: ['نابلس'], contactPhone: '+970599123456',
      workingHours: {}, availabilityStatus: 'AVAILABLE',
    },
    create: {
      sellerProfileId: sellerProfile.id, businessName: 'E2E Service Provider',
      description: 'مقدم خدمات للاختبارات الحقيقية.', serviceAreaCities: ['نابلس'],
      contactPhone: '+970599123456', workingHours: {}, availabilityStatus: 'AVAILABLE',
    },
  });
  await prisma.serviceProviderServiceType.upsert({
    where: { providerId_serviceTypeId: { providerId: provider.id, serviceTypeId: serviceType.id } },
    update: { isActive: true },
    create: { providerId: provider.id, serviceTypeId: serviceType.id, isActive: true },
  });
  await prisma.serviceListing.upsert({
    where: { offlineOperationId: 'e2e-seeded-service-v1' },
    update: {
      providerId: provider.id, categoryId: serviceCategory.id, serviceTypeId: serviceType.id,
      title: 'E2E خدمة اختبار', description: 'خدمة حقيقية لاختبارات المتصفح.',
      images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'], status: 'ACTIVE', pricingType: 'NEGOTIABLE', serviceLocation: 'AT_PROVIDER',
    },
    create: {
      id: 'e2e-seeded-service', offlineOperationId: 'e2e-seeded-service-v1',
      providerId: provider.id, categoryId: serviceCategory.id, serviceTypeId: serviceType.id,
      title: 'E2E خدمة اختبار', description: 'خدمة حقيقية لاختبارات المتصفح.',
      images: ['https://res.cloudinary.com/demo/image/upload/sample.jpg'], status: 'ACTIVE', pricingType: 'NEGOTIABLE', serviceLocation: 'AT_PROVIDER',
    },
  });

  await prisma.notification.upsert({
    where: { idempotencyKey: 'e2e-notification-buyer-v1' },
    update: {
      userId: buyer.id, type: 'NEW_MESSAGE', title: 'إشعار اختبار E2E',
      body: 'إشعار حقيقي محفوظ في قاعدة بيانات الاختبار.', data: { source: 'e2e' }, readAt: null,
    },
    create: {
      idempotencyKey: 'e2e-notification-buyer-v1', userId: buyer.id,
      type: 'NEW_MESSAGE', title: 'إشعار اختبار E2E',
      body: 'إشعار حقيقي محفوظ في قاعدة بيانات الاختبار.', data: { source: 'e2e' },
    },
  });

  console.log(`[seedE2E] real browser fixtures ready: buyer=${buyer.email}, seller=${seller.email}, ad=e2e-seeded-ad`);
}

async function main(): Promise<void> {
  await assertSafeDatabase();
  await seedAdmin();
  await seedCategories();
  await seedRealMarketplaceFixtures();
}

main()
  .catch(err => {
    // eslint-disable-next-line no-console
    console.error('[seedE2E] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
