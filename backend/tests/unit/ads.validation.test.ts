import { createAdSchema, updateAdSchema, getAdsSchema } from '../../src/modules/ads/ads.validation';

/**
 * FIX INTEG-05 — the core bug: isNegotiable used plain z.boolean(),
 * which rejects the string "true"/"false" that multer puts in req.body
 * for every multipart/form-data field (required for createAd's image
 * uploads). Every real ad-creation request from the frontend
 * (adsApi.create always builds a FormData) failed outright with a 400.
 *
 * This file tests ads.validation.ts in isolation — no HTTP server, no
 * database — specifically so the exact string/boolean/undefined
 * matrix is covered fast and precisely, complementing the full-stack
 * multipart regression test in tests/integration/ads.test.ts.
 */
describe('createAdSchema — isNegotiable (FIX INTEG-05)', () => {
  const baseBody = {
    title: 'عنوان إعلان صالح للاختبار',
    description: 'وصف طويل بما فيه الكفاية لاجتياز التحقق من طول العشرين حرفاً',
    city: 'غزة',
  };

  it('accepts the string "true" (as multer/multipart sends it) and parses it as boolean true', () => {
    const result = createAdSchema.safeParse({ body: { ...baseBody, isNegotiable: 'true' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.body.isNegotiable).toBe(true);
  });

  it('accepts the string "false" and parses it as boolean false — NOT true', () => {
    const result = createAdSchema.safeParse({ body: { ...baseBody, isNegotiable: 'false' } });
    expect(result.success).toBe(true);
    // The exact regression a naive z.coerce.boolean() fix would
    // reintroduce: any non-empty string (including "false") is
    // JS-truthy, so a coerce-based fix would silently flip this to true.
    if (result.success) expect(result.data.body.isNegotiable).toBe(false);
  });

  it('still accepts a real JS boolean true (JSON body, non-multipart callers)', () => {
    const result = createAdSchema.safeParse({ body: { ...baseBody, isNegotiable: true } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.body.isNegotiable).toBe(true);
  });

  it('still accepts a real JS boolean false', () => {
    const result = createAdSchema.safeParse({ body: { ...baseBody, isNegotiable: false } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.body.isNegotiable).toBe(false);
  });

  it('defaults to false when isNegotiable is omitted entirely', () => {
    const result = createAdSchema.safeParse({ body: { ...baseBody } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.body.isNegotiable).toBe(false);
  });

  it('rejects a nonsense string value rather than silently coercing it', () => {
    const result = createAdSchema.safeParse({ body: { ...baseBody, isNegotiable: 'maybe' } });
    expect(result.success).toBe(false);
  });
});

describe('updateAdSchema — isNegotiable (FIX INTEG-05 defensive coverage)', () => {
  const baseArgs = { params: { id: 'ad-1' }, body: {} };

  it('accepts the string "true" the same way createAdSchema does', () => {
    const result = updateAdSchema.safeParse({ ...baseArgs, body: { isNegotiable: 'true' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.body.isNegotiable).toBe(true);
  });

  it('accepts the string "false" without flipping it to true', () => {
    const result = updateAdSchema.safeParse({ ...baseArgs, body: { isNegotiable: 'false' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.body.isNegotiable).toBe(false);
  });

  it('leaves isNegotiable undefined when omitted (partial update — untouched, not defaulted)', () => {
    const result = updateAdSchema.safeParse({ ...baseArgs, body: {} });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.body.isNegotiable).toBeUndefined();
  });

  it('still accepts a real JS boolean (PATCH /ads/:id sends plain JSON, not FormData)', () => {
    const result = updateAdSchema.safeParse({ ...baseArgs, body: { isNegotiable: true } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.body.isNegotiable).toBe(true);
  });
});

/**
 * FIX H-1 (integration-audit finding): the frontend's AD_SORT_OPTIONS
 * ("الأكثر مشاهدة" / Most Viewed) has always sent sortBy=views on
 * GET /ads and GET /ads/search, but this enum previously only accepted
 * createdAt/price — every selection of that fully-built, user-visible
 * sort option failed with a 400 ("Validation failed"), with zero test
 * coverage anywhere (unit or e2e) to catch it. This locks in the fix
 * and guards against a future regression silently dropping 'views'
 * again.
 */
describe('getAdsSchema — sortBy (FIX H-1)', () => {
  it('accepts sortBy=createdAt', () => {
    const result = getAdsSchema.safeParse({ query: { sortBy: 'createdAt' } });
    expect(result.success).toBe(true);
  });

  it('accepts sortBy=price', () => {
    const result = getAdsSchema.safeParse({ query: { sortBy: 'price' } });
    expect(result.success).toBe(true);
  });

  it('accepts sortBy=views — regression guard for FIX H-1', () => {
    const result = getAdsSchema.safeParse({ query: { sortBy: 'views' } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.query.sortBy).toBe('views');
  });

  it('rejects an unrecognised sortBy value', () => {
    const result = getAdsSchema.safeParse({ query: { sortBy: 'popularity' } });
    expect(result.success).toBe(false);
  });

  it('leaves sortBy undefined when omitted (repository defaults to createdAt)', () => {
    const result = getAdsSchema.safeParse({ query: {} });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.query.sortBy).toBeUndefined();
  });
});
