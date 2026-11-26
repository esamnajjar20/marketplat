import {
  directImageIntentSchema,
  directImagePublicIdsSchema,
  directImageVerifySchema,
} from '../../src/shared/media/directImageValidation';

describe('direct image upload validation', () => {
  it('accepts only supported purposes and bounded upload counts', () => {
    expect(directImageIntentSchema.safeParse({ purpose: 'ads', count: 3 }).success).toBe(true);
    expect(directImageIntentSchema.safeParse({ purpose: 'avatars', count: 1 }).success).toBe(false);
    expect(directImageIntentSchema.safeParse({ purpose: 'ads', count: 11 }).success).toBe(false);
  });

  it('accepts API-issued public IDs from JSON and legacy multipart string fields', () => {
    const ids = ['classifieds/ads/mp_0123456789abcdef01234567_0123456789abcdef0123456789abcdef'];
    expect(directImagePublicIdsSchema.parse(ids)).toEqual(ids);
    expect(directImagePublicIdsSchema.parse(JSON.stringify(ids))).toEqual(ids);
    expect(directImagePublicIdsSchema.safeParse(['https://attacker.example/image.jpg']).success).toBe(false);
  });

  it('rejects empty, duplicated-shape and unsupported verify payloads', () => {
    expect(directImageVerifySchema.safeParse({ purpose: 'requests', publicIds: [] }).success).toBe(false);
    expect(directImageVerifySchema.safeParse({ purpose: 'requests', publicIds: ['short'] }).success).toBe(false);
    expect(directImageVerifySchema.safeParse({ purpose: 'unknown', publicIds: ['classifieds/ads/mp_0123456789abcdef01234567_0123456789abcdef0123456789abcdef'] }).success).toBe(false);
  });
});
