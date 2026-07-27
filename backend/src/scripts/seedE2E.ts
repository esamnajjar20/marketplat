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
 * fixed, well-known identifiers below rather than inserting blindly,
 * so re-running doesn't create duplicate categories/admin users or
 * fail on unique-constraint conflicts from a previous run.
 */
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../shared/utils/hash';

const prisma = new PrismaClient();

const DB_NAME_SAFETY_PATTERN = /test|e2e/i;

// Fixed, well-known credentials — E2E tests reference these directly
// (see e2e/fixtures/seed-data.ts on the frontend side, which MUST be
// kept in sync with the literals here). Never used outside a
// throwaway E2E database, so there's no real secret to protect.
export const E2E_ADMIN_EMAIL = 'e2e-admin@example.test';
export const E2E_ADMIN_PASSWORD = 'E2eAdminPass123!';

// A minimal, fixed category tree — enough for AdForm's category
// <select> (parent + one child, exercising the optgroup rendering) and
// CategoryGrid's icon-matching rules (see CategoryGrid.test.tsx) without
// seeding all 8+ real production categories.
const E2E_CATEGORIES = [
  { name: 'Vehicles', nameAr: 'مركبات', slug: 'e2e-vehicles', children: [
    { name: 'Cars', nameAr: 'سيارات', slug: 'e2e-cars' },
  ] },
  { name: 'Real Estate', nameAr: 'عقارات', slug: 'e2e-real-estate', children: [] },
];

async function assertSafeDatabase(): Promise<void> {
  const url = process.env.DATABASE_URL ?? '';
  const dbNameMatch = url.match(/\/([^/?]+)(\?|$)/);
  const dbName = dbNameMatch?.[1] ?? '';

  if (!DB_NAME_SAFETY_PATTERN.test(dbName)) {
    throw new Error(
      `Refusing to seed: DATABASE_URL's database name ("${dbName}") does not ` +
        `contain "test" or "e2e". This script is only safe to run against a ` +
        `throwaway E2E database — point DATABASE_URL at one (e.g. ` +
        `classifieds_e2e) before running this.`,
    );
  }
}

async function seedAdmin(): Promise<void> {
  const passwordHash = await hashPassword(E2E_ADMIN_PASSWORD);

  await prisma.user.upsert({
    where: { email: E2E_ADMIN_EMAIL },
    update: { role: 'ADMIN', isActive: true, passwordHash },
    create: {
      name: 'E2E Admin',
      email: E2E_ADMIN_EMAIL,
      passwordHash,
      role: 'ADMIN',
      isActive: true,
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
        create: { name: child.name, nameAr: child.nameAr, slug: child.slug, parentId: parent.id },
      });
    }
  }

  // eslint-disable-next-line no-console
  console.log(`[seedE2E] ${E2E_CATEGORIES.length} top-level categories ready`);
}

async function main(): Promise<void> {
  await assertSafeDatabase();
  await seedAdmin();
  await seedCategories();
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error('[seedE2E] failed:', err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
