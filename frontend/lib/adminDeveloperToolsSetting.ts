import { adminApi, type DeveloperToolsSetting } from '@/api/admin.api';

const CACHE_TTL_MS = 20_000;

type CachedSetting = { value: DeveloperToolsSetting; fetchedAt: number };
type LoadedSetting = { value: DeveloperToolsSetting; stale: boolean };

let cached: CachedSetting | null = null;
let inFlight: Promise<LoadedSetting> | null = null;

/**
 * Share the global developer-tools setting between the site-wide console and
 * the admin dashboard control. The previous two consumers fetched separately,
 * and focus + visibilitychange could trigger two more requests at once.
 *
 * A short TTL and one in-flight promise coalesce those reads. When the server
 * is temporarily unavailable, keep the last known UI state instead of hiding
 * the console on a transient 5xx; the server remains authoritative for API
 * access and the next refresh will reconcile it.
 */
export function loadAdminDeveloperToolsSetting(): Promise<LoadedSetting> {
  if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
    return Promise.resolve({ value: cached.value, stale: false });
  }
  if (inFlight) return inFlight;

  const request = adminApi.getDeveloperToolsSetting()
    .then((response) => {
      const value = response.data.data;
      if (!value || typeof value.enabled !== 'boolean') {
        throw new Error('Invalid developer-tools setting response');
      }
      cached = { value, fetchedAt: Date.now() };
      return { value, stale: false } satisfies LoadedSetting;
    })
    .catch((error: unknown) => {
      if (cached) return { value: cached.value, stale: true } satisfies LoadedSetting;
      throw error;
    })
    .finally(() => {
      if (inFlight === request) inFlight = null;
    });

  inFlight = request;
  return request;
}

/** Update the shared snapshot after a successful admin save and notify readers. */
export function publishAdminDeveloperToolsSetting(value: DeveloperToolsSetting): void {
  cached = { value, fetchedAt: Date.now() };
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('developer-tools-setting-changed', {
      detail: { enabled: value.enabled },
    }));
  }
}

/** Test-only reset is intentionally not exported from the public app surface. */
export function __resetAdminDeveloperToolsSettingForTests(): void {
  cached = null;
  inFlight = null;
}
