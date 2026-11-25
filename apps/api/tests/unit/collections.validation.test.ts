import { reorderCollectionsSchema } from '../../src/modules/commerce/collections/collections.validation';

describe('reorderCollectionsSchema', () => {
  it('accepts a non-empty list up to the configured maximum', () => {
    expect(() => reorderCollectionsSchema.parse({
      body: { orderedIds: ['collection-1', 'collection-2'] },
    })).not.toThrow();

    expect(() => reorderCollectionsSchema.parse({
      body: { orderedIds: Array.from({ length: 1000 }, (_, index) => `collection-${index}`) },
    })).not.toThrow();
  });

  it('rejects an empty list', () => {
    expect(() => reorderCollectionsSchema.parse({ body: { orderedIds: [] } })).toThrow();
  });

  it('rejects lists above 1,000 collection ids', () => {
    expect(() => reorderCollectionsSchema.parse({
      body: { orderedIds: Array.from({ length: 1001 }, (_, index) => `collection-${index}`) },
    })).toThrow();
  });

  it('rejects empty ids inside the list', () => {
    expect(() => reorderCollectionsSchema.parse({
      body: { orderedIds: ['collection-1', ''] },
    })).toThrow();
  });
});
