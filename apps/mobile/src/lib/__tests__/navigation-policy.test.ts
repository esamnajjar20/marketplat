import { describe, expect, it } from 'vitest';
import { DRAWER_ITEMS, MAIN_TABS, getActiveMainTab, getNavigationCapabilitiesRevision, getRouteAccess, getVisibleDrawerItems, invalidateNavigationCapabilities, subscribeNavigationCapabilities, resolveNavigationCapabilities, mergeNavigationCapabilitiesAfterFetch, shouldHideBottomNavigation } from '../navigation-policy';

describe('central navigation policy', () => {
  it('keeps unique primary tab paths and drawer destinations', () => {
    expect(new Set(MAIN_TABS.map((item) => item.path)).size).toBe(MAIN_TABS.length);
    expect(new Set(DRAWER_ITEMS.map((item) => item.path)).size).toBe(DRAWER_ITEMS.length);
  });
  it('keeps explore and add out of the drawer while exposing web-like workspaces', () => {
    expect(DRAWER_ITEMS.some((item) => item.path === '/explore')).toBe(false);
    expect(DRAWER_ITEMS.some((item) => item.path === '/add')).toBe(false);
    for (const section of ['المبيعات', 'متجري', 'خدماتي', 'نشاطي', 'الإعدادات']) {
      expect(DRAWER_ITEMS.some((item) => item.section === section)).toBe(true);
    }
    for (const path of ['/search', '/ads', '/products', '/services', '/requests', '/stores', '/service-providers', '/sellers-ranking']) {
      expect(DRAWER_ITEMS.some((item) => item.path === path)).toBe(true);
    }
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
  it('hides authenticated destinations from guest drawer navigation', () => {
    const guestItems = getVisibleDrawerItems(false);
    expect(guestItems.every((item) => getRouteAccess(item.path) === 'public')).toBe(true);
    expect(guestItems.some((item) => item.path === '/messages')).toBe(false);
    const ordinaryItems = getVisibleDrawerItems(true);
    expect(ordinaryItems.some((item) => item.path === '/seller-dashboard')).toBe(false);
    expect(ordinaryItems.some((item) => item.path === '/service-requests')).toBe(false);
    expect(ordinaryItems.some((item) => item.path === '/seller-profile')).toBe(true);
  });

  it('exposes seller and service-provider profile setup through authenticated account navigation', () => {
    const sellerProfile = DRAWER_ITEMS.find((item) => item.path === '/seller-profile');
    const providerProfile = DRAWER_ITEMS.find((item) => item.path === '/service-provider-profile');
    expect(sellerProfile?.label).toBe('ملف البائع');
    expect(providerProfile?.label).toBe('ملف مقدم الخدمة');
    expect(getRouteAccess('/seller-profile')).toBe('authenticated');
    expect(getRouteAccess('/service-provider-profile')).toBe('authenticated');
  });


  it('invalidates cached navigation capabilities after seller, provider, or store membership changes', () => {
    const before = getNavigationCapabilitiesRevision();
    let notifications = 0;
    const unsubscribe = subscribeNavigationCapabilities(() => { notifications += 1; });
    invalidateNavigationCapabilities();
    expect(getNavigationCapabilitiesRevision()).toBe(before + 1);
    expect(notifications).toBe(1);
    unsubscribe();
    invalidateNavigationCapabilities();
    expect(notifications).toBe(1);
  });

  it('derives drawer capabilities from the shared seller, membership, and provider facts', () => {
    expect(resolveNavigationCapabilities({
      hasSellerProfile: false,
      activeStoreMembershipCount: 0,
      hasServiceProviderProfile: false,
    })).toEqual({ sellerWorkspace: false, storeMembership: false, serviceProvider: false });
    expect(resolveNavigationCapabilities({
      hasSellerProfile: false,
      activeStoreMembershipCount: 1,
      hasServiceProviderProfile: false,
    })).toEqual({ sellerWorkspace: true, storeMembership: true, serviceProvider: false });
    expect(resolveNavigationCapabilities({
      hasSellerProfile: true,
      activeStoreMembershipCount: 0,
      hasServiceProviderProfile: true,
    })).toEqual({ sellerWorkspace: true, storeMembership: false, serviceProvider: true });
  });

  it('shows seller and provider workspaces only when the account capabilities are confirmed', () => {
    const capabilities = resolveNavigationCapabilities({
      hasSellerProfile: true,
      activeStoreMembershipCount: 1,
      hasServiceProviderProfile: true,
    });
    const visible = getVisibleDrawerItems(true, capabilities);
    expect(visible.some((item) => item.path === '/seller-dashboard')).toBe(true);
    expect(visible.some((item) => item.path === '/my-stores')).toBe(true);
    expect(visible.some((item) => item.path === '/service-requests')).toBe(true);
    expect(getVisibleDrawerItems(true, { sellerWorkspace: false, storeMembership: false, serviceProvider: false })
      .some((item) => item.path === '/seller-dashboard' || item.path === '/my-stores' || item.path === '/service-requests')).toBe(false);
  });

  it('keeps workspace destinations discoverable while capabilities are unknown', () => {
    const visible = getVisibleDrawerItems(true, undefined, { unknownCapabilities: { sellerWorkspace: true, storeMembership: true, serviceProvider: true } });
    expect(visible.some((item) => item.path === '/seller-dashboard')).toBe(true);
    expect(visible.some((item) => item.path === '/my-stores')).toBe(true);
    expect(visible.some((item) => item.path === '/service-requests')).toBe(true);

    // Unknown role capabilities must not make authenticated links visible to guests.
    expect(getVisibleDrawerItems(false, undefined, { unknownCapabilities: { sellerWorkspace: true, storeMembership: true, serviceProvider: true } })
      .some((item) => item.path === '/seller-dashboard' || item.path === '/service-requests')).toBe(false);
  });

  it('shows only workspace sections whose capability result is unknown during a partial failure', () => {
    const visible = getVisibleDrawerItems(true, {
      sellerWorkspace: false,
      storeMembership: false,
      serviceProvider: false,
    }, {
      unknownCapabilities: { sellerWorkspace: true },
    });
    expect(visible.some((item) => item.path === '/seller-dashboard')).toBe(true);
    expect(visible.some((item) => item.path === '/my-stores')).toBe(false);
    expect(visible.some((item) => item.path === '/service-requests')).toBe(false);
  });

  it('preserves previously confirmed workspace access when a capability request fails', () => {
    const previous = { sellerWorkspace: true, storeMembership: true, serviceProvider: true };
    const unresolved = { sellerWorkspace: false, storeMembership: false, serviceProvider: false };
    expect(mergeNavigationCapabilitiesAfterFetch(previous, unresolved, {
      sellerProfile: true,
      storeMemberships: true,
      serviceProvider: true,
    })).toEqual(previous);
  });

  it('uses fresh capability results when every capability request succeeds', () => {
    const previous = { sellerWorkspace: true, storeMembership: true, serviceProvider: true };
    const resolved = { sellerWorkspace: false, storeMembership: false, serviceProvider: false };
    expect(mergeNavigationCapabilitiesAfterFetch(previous, resolved, {
      sellerProfile: false,
      storeMemberships: false,
      serviceProvider: false,
    })).toEqual(resolved);
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
