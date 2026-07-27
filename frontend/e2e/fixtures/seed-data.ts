/**
 * e2e/fixtures/seed-data.ts
 *
 * MUST stay in sync with backend-v9/src/scripts/seedE2E.ts — these are
 * not independent test data, they're the frontend-side mirror of what
 * that script actually inserts into the E2E database. If the seed
 * script's admin email/password or category slugs change, update here
 * too (and vice versa). There's no automated check tying these
 * together across the two repos; a mismatch here fails at runtime with
 * a confusing "invalid credentials" or "category not found", not a
 * clear diff.
 */
export const SEEDED_ADMIN = {
  email: 'e2e-admin@example.test',
  password: 'E2eAdminPass123!',
} as const;

export const SEEDED_CATEGORIES = {
  vehicles: { nameAr: 'مركبات', slug: 'e2e-vehicles' },
  cars: { nameAr: 'سيارات', slug: 'e2e-cars' }, // child of vehicles
  realEstate: { nameAr: 'عقارات', slug: 'e2e-real-estate' },
} as const;
