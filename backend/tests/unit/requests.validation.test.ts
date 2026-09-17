import { createRequestSchema, submitOfferSchema } from '../../src/modules/requests/requests.validation';

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

  it('accepts offer body with price only', () => {
    const parsed = submitOfferSchema.parse({
      params: { id: 'req_1' },
      body: { price: 150.5 },
    });
    expect(parsed.body.price).toBe(150.5);
  });
});
