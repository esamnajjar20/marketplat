import { describe, it, expect } from 'vitest';
import { hrefFor } from '@/lib/notificationMeta';
import type { Notification } from '@/types/notification.types';

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
