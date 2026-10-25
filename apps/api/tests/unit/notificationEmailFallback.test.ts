import {
  isEmailFallbackType,
  summarizeDigest,
  userWantsEmailFallback,
} from '../../src/shared/utils/notificationEmailFallback';

describe('email fallback rules', () => {
  it('only direct/transactional types are eligible', () => {
    expect(isEmailFallbackType('NEW_MESSAGE')).toBe(true);
    expect(isEmailFallbackType('SERVICE_REQUEST_NEW')).toBe(true);
    for (const t of ['PROMOTION', 'FAV_AD_PRICE_CHANGED', 'SAVED_SEARCH_MATCH', 'STORE_NEW_PRODUCT', 5, undefined]) {
      expect(isEmailFallbackType(t)).toBe(false);
    }
  });

  it('is strictly opt-in', () => {
    expect(userWantsEmailFallback({ emailFallback: true })).toBe(true);
    expect(userWantsEmailFallback({})).toBe(false);
    expect(userWantsEmailFallback({ emailFallback: 'true' })).toBe(false);
    expect(userWantsEmailFallback(null)).toBe(false);
  });

  it('builds the digest subject and caps the items', () => {
    expect(summarizeDigest([{ title: 'رسالة جديدة', body: 'x' }], 1)).toMatchObject({
      subject: 'رسالة جديدة — سوق غزة',
      more: 0,
    });
    const many = Array.from({ length: 6 }, (_, i) => ({ title: `t${i}`, body: '' }));
    const s = summarizeDigest(many, 9);
    expect(s.shown).toHaveLength(5);
    expect(s.more).toBe(4);
    expect(s.subject).toContain('9');
  });
});
