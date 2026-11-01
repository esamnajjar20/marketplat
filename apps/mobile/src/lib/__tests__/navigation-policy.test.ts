import { describe, expect, it } from 'vitest';
import { DRAWER_ITEMS, MAIN_TABS, getActiveMainTab, getRouteAccess, shouldHideBottomNavigation } from '../navigation-policy';

describe('central navigation policy', () => {
  it('keeps unique primary tab paths and drawer destinations', () => {
    expect(new Set(MAIN_TABS.map((item) => item.path)).size).toBe(MAIN_TABS.length);
    expect(new Set(DRAWER_ITEMS.map((item) => item.path)).size).toBe(DRAWER_ITEMS.length);
  });
  it('classifies nested public market routes consistently', () => {
    expect(getActiveMainTab('/products/abc')).toBe('explore');
    expect(getActiveMainTab('/stores/abc')).toBe('explore');
    expect(getActiveMainTab('/profile/seller-1')).toBe('explore');
    expect(getActiveMainTab('/profile')).toBe('account');
  });
  it('keeps account and message routes out of inappropriate tab states', () => {
    expect(getActiveMainTab('/my-ads')).toBe('account');
    expect(getActiveMainTab('/messages')).toBe('messages');
    expect(shouldHideBottomNavigation('/messages/thread-1')).toBe(true);
    expect(shouldHideBottomNavigation('/order-checkout')).toBe(true);
  });
  it('marks private account roots without treating public entity details as private', () => {
    expect(getRouteAccess('/my-ads')).toBe('authenticated');
    expect(getRouteAccess('/products/abc')).toBe('public');
  });
});
