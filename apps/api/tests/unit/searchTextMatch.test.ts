import { normalizeSearchText, matchesSearchQuery } from '../../src/shared/utils/searchTextMatch';

describe('normalizeSearchText', () => {
  it('folds hamza/madda/wasla alef variants to bare alef', () => {
    expect(normalizeSearchText('أحمد')).toBe(normalizeSearchText('احمد'));
    expect(normalizeSearchText('إحمد')).toBe(normalizeSearchText('احمد'));
    expect(normalizeSearchText('آحمد')).toBe(normalizeSearchText('احمد'));
    expect(normalizeSearchText('ٱحمد')).toBe(normalizeSearchText('احمد'));
  });

  it('folds alef maksura to yeh', () => {
    expect(normalizeSearchText('مبنى')).toBe(normalizeSearchText('مبني'));
  });

  it('does NOT fold ta marbuta and ha (same conservative choice as arabic_normalize())', () => {
    expect(normalizeSearchText('مدرسة')).not.toBe(normalizeSearchText('مدرسه'));
  });

  it('strips tatweel/kashida', () => {
    expect(normalizeSearchText('بيــت')).toBe(normalizeSearchText('بيت'));
  });

  it('strips tashkeel diacritics', () => {
    expect(normalizeSearchText('مَدْرَسَةٌ')).toBe(normalizeSearchText('مدرسة'));
  });

  it('lowercases Latin text', () => {
    expect(normalizeSearchText('IPHONE')).toBe('iphone');
  });

  it('returns an empty string for null/undefined/empty input', () => {
    expect(normalizeSearchText(null)).toBe('');
    expect(normalizeSearchText(undefined)).toBe('');
    expect(normalizeSearchText('')).toBe('');
  });
});

describe('matchesSearchQuery', () => {
  it('matches a single word regardless of case', () => {
    expect(matchesSearchQuery(['iPhone 13 for sale', ''], 'iphone')).toBe(true);
  });

  it('requires every word to be present (AND, not OR)', () => {
    expect(matchesSearchQuery(['Toyota Camry 2020', ''], 'toyota honda')).toBe(false);
  });

  it('matches regardless of word order across a single haystack field', () => {
    expect(matchesSearchQuery(['Toyota Camry 2020', ''], 'camry toyota')).toBe(true);
  });

  it('matches when the query words are split across multiple haystack fields', () => {
    expect(matchesSearchQuery(['iPhone 13 case', 'barely used stock'], 'stock iphone')).toBe(true);
  });

  it('matches across Arabic letter-shape variants', () => {
    expect(matchesSearchQuery(['سيارة اوتوماتيك للبيع', ''], 'أوتوماتيك سيارة')).toBe(true);
  });

  it('treats an empty/whitespace query as matching everything', () => {
    expect(matchesSearchQuery(['anything'], '   ')).toBe(true);
  });

  it('ignores null/undefined haystack entries', () => {
    expect(matchesSearchQuery([null, undefined, 'iPhone'], 'iphone')).toBe(true);
  });
});
