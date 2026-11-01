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
    expect(getActiveMainTab('/ads')).toBe('explore');
    expect(getActiveMainTab('/ads/abc')).toBe('explore');
    expect(getActiveMainTab('/profile/seller-1')).toBe('explore');
    expect(getActiveMainTab('/profile')).toBe('account');
    expect(getActiveMainTab('/seller-dashboard')).toBe('account');
    expect(getActiveMainTab('/service-types')).toBe('explore');
    expect(getActiveMainTab('/following')).toBe('account');
    expect(getActiveMainTab('/store/main/stats')).toBe('account');
    expect(getActiveMainTab('/sessions')).toBe('account');
    expect(getActiveMainTab('/saved-payments')).toBe('account');
  });
  it('keeps account and message routes out of inappropriate tab states', () => {
    expect(getActiveMainTab('/my-ads')).toBe('account');
    expect(getActiveMainTab('/messages')).toBe('messages');
    expect(shouldHideBottomNavigation('/messages/thread-1')).toBe(true);
    expect(shouldHideBottomNavigation('/order-checkout')).toBe(true);
  });
  it('marks private account roots without treating public entity details as private', () => {
    expect(getRouteAccess('/my-ads')).toBe('authenticated');
    expect(getRouteAccess('/add')).toBe('authenticated');
    expect(getRouteAccess('/messages/thread-1')).toBe('authenticated');
    expect(getRouteAccess('/orders/order-1')).toBe('authenticated');
    expect(getRouteAccess('/sales/sale-1/receipt')).toBe('authenticated');
    expect(getRouteAccess('/store/example/stats')).toBe('authenticated');
    expect(getRouteAccess('/following-feed')).toBe('authenticated');
    expect(getRouteAccess('/profile')).toBe('authenticated');
    for (const path of ['/favorites', '/appointments', '/blocked-users', '/customers', '/debts', '/installments', '/saved-searches', '/sessions']) {
      expect(getRouteAccess(path)).toBe('authenticated');
    }
    expect(getRouteAccess('/products/abc')).toBe('public');
    expect(getRouteAccess('/profile/public-user')).toBe('public');
    expect(getRouteAccess('/stores/store-1')).toBe('public');
  });
  it('normalizes query strings and trailing slashes before applying route rules', () => {
    expect(getRouteAccess('/messages/thread-1/?from=push')).toBe('authenticated');
    expect(shouldHideBottomNavigation('/products/123?source=feed')).toBe(true);
  });
});
