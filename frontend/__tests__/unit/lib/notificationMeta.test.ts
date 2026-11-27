import { describe, it, expect } from 'vitest';
import { hrefFor } from '@/lib/notificationMeta';
import type { Notification } from '@/types/notification.types';
import { NOTIFICATION_CATEGORY_TYPES, NOTIFICATION_TYPE_META, NOTIFICATION_TYPES, resolveNotificationTarget } from '@marketplat/contracts';

function n(type: string, data: Record<string, string> | null = null): Notification {
  return { id: 'n1', type, data } as unknown as Notification;
}

describe('hrefFor — weekly reports (ROUTE-FIX-01)', () => {
  it('ad views report → /dashboard (same as the push url)', () => {
    expect(hrefFor(n('WEEKLY_AD_VIEWS_REPORT'))).toBe('/dashboard');
  });

  it('store views report → store analytics tab', () => {
    expect(hrefFor(n('WEEKLY_STORE_VIEWS_REPORT'))).toBe('/my-store?tab=analytics');
  });

  it('service views report → my-services analytics tab', () => {
    expect(hrefFor(n('WEEKLY_SERVICE_VIEWS_REPORT'))).toBe('/my-services?tab=analytics');
  });
});

describe('hrefFor — service requests & appointments', () => {
  it.each(['SERVICE_REQUEST_NEW', 'SERVICE_REQUEST_UPDATE', 'APPOINTMENT_UPDATE'])(
    '%s → the request detail page (same URL the push sends)',
    (type) => {
      expect(hrefFor(n(type, { requestId: 'req-1' }))).toBe('/service-requests/req-1');
    },
  );

  it('falls back to the notifications page when requestId is missing', () => {
    expect(hrefFor(n('SERVICE_REQUEST_UPDATE'))).toBe('/notifications');
  });
});


describe('hrefFor — ad lifecycle', () => {
  it.each(['AD_EXPIRING_SOON', 'AD_EXPIRED'])('%s → ad detail', (type) => {
    expect(hrefFor(n(type, { adId: 'ad-1' }))).toBe('/ads/ad-1');
  });
});


describe('notification contract parity', () => {
  it('has a label, icon and category for every notification type', () => {
    expect(Object.keys(NOTIFICATION_TYPE_META).sort()).toEqual([...NOTIFICATION_TYPES].sort());
    for (const meta of Object.values(NOTIFICATION_TYPE_META)) {
      expect(meta.label.trim()).not.toBe('');
      expect(meta.icon).toBeTruthy();
      expect(meta.category).toBeTruthy();
    }
  });

  it('partitions all notification types into exactly one category', () => {
    const allTypes = Object.values(NOTIFICATION_CATEGORY_TYPES).flat();
    expect(allTypes).toHaveLength(NOTIFICATION_TYPES.length);
    expect([...allTypes].sort()).toEqual([...NOTIFICATION_TYPES].sort());
  });

  it('maps all previously divergent notification families to shared targets', () => {
    expect(resolveNotificationTarget('NEW_FOLLOWER', { followerId: 'u1' })).toEqual({ kind: 'profile', id: 'u1' });
    expect(resolveNotificationTarget('FOLLOWED_USER_ACTIVITY', null)).toEqual({ kind: 'following_feed' });
    expect(resolveNotificationTarget('NEW_SERVICE_QUOTE', { serviceId: 's1' })).toEqual({ kind: 'service', id: 's1' });
    expect(resolveNotificationTarget('SERVICE_QUOTE_ACCEPTED', { listingId: 's2' })).toEqual({ kind: 'service', id: 's2' });
    expect(resolveNotificationTarget('STORE_NEW_PRODUCT', { productId: 'p1', storeId: 'st1' })).toEqual({ kind: 'product', id: 'p1' });
    expect(resolveNotificationTarget('PROMOTION', null)).toEqual({ kind: 'home' });
    expect(resolveNotificationTarget('SALES_DAILY_SUMMARY', null)).toEqual({ kind: 'sales' });
  });
});
