import {
  isSearchCacheWhitelistCandidate,
  normalizeSearchCacheTerm,
} from '../../src/shared/utils/searchCacheWhitelist';

describe('search cache whitelist candidates', () => {
  it('normalizes Unicode and collapses whitespace', () => {
    expect(normalizeSearchCacheTerm('  سَيّارة   مستعملة  ')).toBe('سَيّارة مستعملة');
  });

  it('accepts short Arabic and Latin public search phrases', () => {
    expect(isSearchCacheWhitelistCandidate('سيارة')).toBe(true);
    expect(isSearchCacheWhitelistCandidate('قطع غيار')).toBe(true);
    expect(isSearchCacheWhitelistCandidate('used car')).toBe(true);
  });

  it('rejects identifiers, contact details, long phrases and numeric queries', () => {
    expect(isSearchCacheWhitelistCandidate('0591234567')).toBe(false);
    expect(isSearchCacheWhitelistCandidate('person@example.com')).toBe(false);
    expect(isSearchCacheWhitelistCandidate('سيارة 2024')).toBe(false);
    expect(isSearchCacheWhitelistCandidate('بحث عن سيارة للبيع في غزة')).toBe(false);
    expect(isSearchCacheWhitelistCandidate('x')).toBe(false);
  });
});
