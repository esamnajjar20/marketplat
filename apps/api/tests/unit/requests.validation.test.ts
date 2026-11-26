import { createRequestSchema, submitOfferSchema } from '../../src/modules/classifieds/requests/requests.validation';

describe('requests.validation', () => {
  it('accepts a minimal valid SERVICE body without budgets', () => {
    const parsed = createRequestSchema.parse({
      body: {
        type: 'SERVICE',
        categoryId: 'cat_1',
        title: 'Need AC repair',
        description: 'Split unit not cooling well enough',
      },
    });
    expect(parsed.body.type).toBe('SERVICE');
    expect(parsed.body.budgetMax).toBeUndefined();
  });

  it('rejects budgetMin > budgetMax', () => {
    expect(() =>
      createRequestSchema.parse({
        body: {
          type: 'PRODUCT',
          categoryId: 'cat_1',
          title: 'Want a phone',
          description: 'Looking for a used flagship phone',
          budgetMin: 3000,
          budgetMax: 1000,
        },
      }),
    ).toThrow();
  });

  it('rejects short title', () => {
    expect(() =>
      createRequestSchema.parse({
        body: {
          type: 'RENTAL',
          categoryId: 'cat_1',
          title: 'Hi',
          description: 'Need a two bedroom apartment downtown',
        },
      }),
    ).toThrow();
  });

  it('accepts issued direct image IDs for request attachments', () => {
    const parsed = createRequestSchema.parse({
      body: {
        type: 'PRODUCT',
        categoryId: 'cat_1',
        title: 'Want a phone',
        description: 'Looking for a used flagship phone',
        directImagePublicIds: [
          'classifieds/requests/mp_111111111111111111111111_22222222222222222222222222222222',
        ],
      },
    });
    expect(parsed.body.directImagePublicIds).toHaveLength(1);
  });

  it('rejects MarketPlat Cloudinary URLs in attachedImages to prevent upload intent reuse by URL', () => {
    expect(() => createRequestSchema.parse({
      body: {
        type: 'PRODUCT',
        categoryId: 'cat_1',
        title: 'Want a phone',
        description: 'Looking for a used flagship phone',
        attachedImages: [
          'https://res.cloudinary.com/demo/image/upload/v123/classifieds/requests/mp_111111111111111111111111_22222222222222222222222222222222.webp',
        ],
      },
    })).toThrow(/MarketPlat Cloudinary assets must be submitted as directImagePublicIds/);
  });

  it('rejects legacy request-upload URLs because they have no one-time intent to consume', () => {
    expect(() => createRequestSchema.parse({
      body: {
        type: 'PRODUCT',
        categoryId: 'cat_1',
        title: 'Want a phone',
        description: 'Looking for a used flagship phone',
        attachedImages: [
          'https://res.cloudinary.com/demo/image/upload/v123/classifieds/requests/legacy-random-asset.webp',
        ],
      },
    })).toThrow(/MarketPlat Cloudinary assets must be submitted as directImagePublicIds/);
  });

  it('caps direct image references for a request at five', () => {
    const directImagePublicIds = Array.from({ length: 6 }, (_, index) =>
      `classifieds/requests/mp_111111111111111111111111_${String(index).padStart(32, '2')}`
    );
    expect(() => createRequestSchema.parse({
      body: {
        type: 'PRODUCT',
        categoryId: 'cat_1',
        title: 'Want a phone',
        description: 'Looking for a used flagship phone',
        directImagePublicIds,
      },
    })).toThrow();
  });

  it('accepts offer body with price only', () => {
    const parsed = submitOfferSchema.parse({
      params: { id: 'req_1' },
      body: { price: 150.5 },
    });
    expect(parsed.body.price).toBe(150.5);
  });
});
