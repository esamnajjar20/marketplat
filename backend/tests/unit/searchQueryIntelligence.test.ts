import { analyzeSearchQuery, expandedRequiredConcepts } from '../../src/shared/utils/searchQueryIntelligence';
import { matchesSearchQuery } from '../../src/shared/utils/searchTextMatch';

describe('searchQueryIntelligence', () => {
  it('expands موبايل ↔ جوال', () => {
    const a = analyzeSearchQuery('موبايل');
    expect(a.tsQueryString).toMatch(/جوال/);
    expect(a.tsQueryString).toMatch(/موبايل/);
  });

  it('strips ال and folds ة/ه on query side', () => {
    const a = analyzeSearchQuery('السيارة');
    expect(a.tsQueryString).toMatch(/سيارة|سياره/);
  });

  it('detects store intent', () => {
    const a = analyzeSearchQuery('محل اديداس');
    expect(a.preferredTypes).toContain('store');
  });

  it('saved-search matching uses synonyms', () => {
    expect(matchesSearchQuery(['موبايل سامسونج للبيع'], 'جوال')).toBe(true);
  });

  it('expandedRequiredConcepts returns alternatives', () => {
    const c = expandedRequiredConcepts('جوال اسود');
    expect(c.length).toBeGreaterThanOrEqual(1);
    expect(c[0].some((t) => t.includes('موبايل') || t.includes('جوال'))).toBe(true);
  });
});
