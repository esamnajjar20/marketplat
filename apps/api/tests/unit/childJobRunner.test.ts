import { getProductionScheduledJobScript } from '../../src/scripts/childJobRunner';

describe('Go scheduler production job adapter allowlist', () => {
  it('maps every daily scheduler job to a compiled API script', () => {
    const expected: Record<string, string> = {
      'report:expire-ads': 'expireAds',
      'report:notification-digest': 'dailyNotificationDigest',
      'report:seller-response-metrics': 'updateSellerResponseMetrics',
      'report:cleanup-tokens': 'cleanupExpiredTokens',
      'report:cleanup-failed-tasks': 'cleanupFailedBackgroundTasks',
      'report:cleanup-notifications': 'cleanupOldNotifications',
      'report:cleanup-stories': 'cleanupExpiredStories',
      'report:cleanup-media-assets': 'cleanupMediaAssets',
      'report:analytics-rollup': 'rollupAnalytics',
      'report:inventory-monitor': 'inventoryMonitor',
      'report:fraud-monitor': 'fraudMonitor',
      'report:expire-service-requests': 'expireStaleServiceRequests',
      'report:cleanup-analytics': 'cleanupAnalytics',
      'report:demote-stale-boosts': 'demoteStaleAdBoosts',
      'report:weekly-ad-views': 'weeklyAdViewsReport',
      'report:weekly-store-views': 'weeklyStoreViewsReport',
      'report:weekly-service-views': 'weeklyServiceViewsReport',
      'report:expire-open-requests': 'expireOpenRequests',
    };

    for (const [name, script] of Object.entries(expected)) {
      expect(getProductionScheduledJobScript(name)).toBe(script);
    }
    expect(Object.keys(expected)).toHaveLength(18);
  });

  it('does not allow arbitrary npm scripts or filesystem paths', () => {
    expect(getProductionScheduledJobScript('start')).toBeNull();
    expect(getProductionScheduledJobScript('../../package.json')).toBeNull();
    expect(getProductionScheduledJobScript('report:unknown')).toBeNull();
    expect(getProductionScheduledJobScript('constructor')).toBeNull();
    expect(getProductionScheduledJobScript('__proto__')).toBeNull();
  });
});
