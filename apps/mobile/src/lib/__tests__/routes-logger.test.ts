import { describe, expect, it } from 'vitest';
import { routes, TAB_ROUTES } from '../routes';

describe('routes', () => {
  it('exposes stable tab paths', () => {
    expect(TAB_ROUTES).toContain('/');
    expect(TAB_ROUTES).toContain('/messages');
    expect(routes.ads.detail('abc')).toBe('/ads/abc');
    expect(routes.messages.thread('t1')).toBe('/messages/t1');
  });
});
