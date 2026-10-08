'use client';

export interface WarmingManifestRoute {
  assets: readonly string[];
  auth: boolean;
}

export interface WarmingManifest {
  version: number;
  /** Build identifier when available; used only for stale-manifest diagnostics. */
  buildId?: string;
  generatedAt: string;
  source: string;
  routes: Record<string, WarmingManifestRoute>;
}

let manifestPromise: Promise<WarmingManifest | null> | null = null;

function normalize(input: unknown): WarmingManifest | null {
  if (!input || typeof input !== 'object') return null;
  const value = input as Partial<WarmingManifest>;
  if (!value.routes || typeof value.routes !== 'object') return null;
  return {
    version: typeof value.version === 'number' ? value.version : 1,
    buildId: typeof value.buildId === 'string' ? value.buildId : undefined,
    generatedAt: typeof value.generatedAt === 'string' ? value.generatedAt : '',
    source: typeof value.source === 'string' ? value.source : 'unknown',
    routes: Object.fromEntries(Object.entries(value.routes).map(([route, entry]) => {
      const e = entry as Partial<WarmingManifestRoute> | undefined;
      return [route, {
        assets: Array.isArray(e?.assets) ? e.assets.filter((x): x is string => typeof x === 'string') : [],
        auth: e?.auth === true,
      }];
    })),
  };
}

export function getWarmingManifest(): Promise<WarmingManifest | null> {
  if (typeof window === 'undefined') return Promise.resolve(null);
  if (manifestPromise) return manifestPromise;
  manifestPromise = fetch('/warming-manifest.json', { cache: 'no-store', credentials: 'same-origin' })
    .then((response) => response.ok ? response.json() : null)
    .then(normalize)
    .catch(() => null);
  return manifestPromise;
}

export async function getExpectedRouteAssets(route: string): Promise<readonly string[]> {
  const manifest = await getWarmingManifest();
  return manifest?.routes[route]?.assets ?? [];
}
