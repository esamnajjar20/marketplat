import { describe, it, expect } from 'vitest';
import {
  resolveOfflineTab,
  visibleOfflineTabs,
  offlineTabHref,
  isOfflineTab,
  OFFLINE_TABS,
} from '../../../lib/offlineHubTabs';

describe('offline hub tab model (OFFLINE-HUB-01)', () => {
  it('keeps the requested product order for the hub', () => {
    expect(OFFLINE_TABS).toEqual(['storage', 'saved', 'payments', 'warming', 'sync', 'drafts']);
  });
  it('reads ?tab= and ignores unknown values', () => {
    expect(resolveOfflineTab('?tab=sync', '/offline')).toBe('sync');
    expect(resolveOfflineTab('?tab=nope', '/offline')).toBeNull();
    expect(resolveOfflineTab('', '/offline')).toBeNull();
  });

  it('maps legacy paths (SW fallback keeps the old address bar URL)', () => {
    expect(resolveOfflineTab('', '/settings/sync')).toBe('sync');
    expect(resolveOfflineTab('', '/settings/storage/')).toBe('storage');
    expect(resolveOfflineTab('', '/settings/offline')).toBe('warming');
    expect(resolveOfflineTab('', '/settings/drafts')).toBe('drafts');
    expect(resolveOfflineTab('', '/saved-ads')).toBe('saved');
    expect(resolveOfflineTab('', '/downloads')).toBe('saved');
    expect(resolveOfflineTab('', '/saved-payments')).toBe('payments');
  });

  it('query wins over legacy path', () => {
    expect(resolveOfflineTab('?tab=drafts', '/settings/sync')).toBe('drafts');
  });

  it('guests only see tabs that need no account', () => {
    expect(visibleOfflineTabs(false)).toEqual(['saved', 'warming']);
    expect(visibleOfflineTabs(true)).toEqual(OFFLINE_TABS);
    expect(visibleOfflineTabs(false)).not.toContain('payments');
  });

  it('builds canonical links', () => {
    expect(offlineTabHref('sync')).toBe('/offline?tab=sync');
    expect(offlineTabHref('payments')).toBe('/offline?tab=payments');
    expect(isOfflineTab('storage')).toBe(true);
    expect(isOfflineTab('x')).toBe(false);
  });
});
