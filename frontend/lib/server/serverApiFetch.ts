/**
 * Shared, server-only API reader for App Router Server Components.
 *
 * Production Cloudflare SSR must use the API_WORKER Service Binding. Calling
 * the API Worker through its workers.dev URL from another Worker can fail
 * with Cloudflare error 1042. Since a Service Binding fetch is not Next's
 * patched global fetch, public responses are cached with unstable_cache;
 * private/mutable reads stay uncached and are only request-deduplicated by
 * React.cache().
 */
import 'server-only';

import { unstable_cache } from 'next/cache';
import { cache } from 'react';
import { API_BASE_URL } from '@/lib/constants';
import type { ApiResponse } from '@/types/api.types';
import { getPublicApiCacheTags } from './serverCacheTags';

export type ServerApiCachePolicy =
  | {
      mode: 'no-store';
      timeoutMs?: number;
    }
  | {
      mode: 'public';
      revalidateSeconds: number;
      tags: readonly string[];
      timeoutMs?: number;
    };

type ApiWorkerBinding = {
  fetch: (request: Request) => Promise<Response>;
};

type CloudflareBindingContext = {
  contextAvailable: boolean;
  apiWorker: ApiWorkerBinding | null;
};

const SERVER_API_CACHE_VERSION = 'marketplat-server-api-v1';
const DEFAULT_SERVER_API_TIMEOUT_MS = 8_000;
const MIN_PUBLIC_REVALIDATE_SECONDS = 5;
const MAX_PUBLIC_REVALIDATE_SECONDS = 86_400;
const MAX_CACHE_TAGS = 16;

/**
 * React request memoization only. This does not persist data between visits.
 * The stable public cache below is owned by Next's incremental cache.
 */
const requestApiEnvelope = cache(async (
  path: string,
  timeoutMs: number,
): Promise<ApiResponse<unknown>> => requestApiEnvelopeUncached(path, timeoutMs));

async function resolveCloudflareBinding(): Promise<CloudflareBindingContext> {
  // Local Next dev and Node deployments use the configured API origin.
  // Cloudflare production resolves the binding from the active request context.
  if (process.env.NODE_ENV !== 'production') {
    return { contextAvailable: false, apiWorker: null };
  }

  try {
    // This package is present in the Cloudflare deployment. A dynamic import
    // keeps ordinary Node/Next development independent from its request context.
    const { getCloudflareContext } = await import('@opennextjs/cloudflare');
    const context = getCloudflareContext();
    const env = context.env as unknown as { API_WORKER?: ApiWorkerBinding };
    return {
      contextAvailable: true,
      apiWorker: env.API_WORKER ?? null,
    };
  } catch {
    // Node-hosted Next.js (or local tests) has no Cloudflare request context.
    return { contextAvailable: false, apiWorker: null };
  }
}

function normalizeApiPath(path: string): string {
  if (typeof path !== 'string' || !path.startsWith('/') || path.startsWith('//')) {
    throw new Error('مسار طلب الخادم غير صالح');
  }

  const parsed = new URL(path, 'https://marketplat-internal.invalid');
  if (
    parsed.origin !== 'https://marketplat-internal.invalid' ||
    parsed.hash ||
    parsed.pathname.split('/').some((segment) => segment === '.' || segment === '..')
  ) {
    throw new Error('مسار طلب الخادم غير صالح');
  }

  return `${parsed.pathname}${parsed.search}`;
}

function validatePublicCachePolicy(policy: Extract<ServerApiCachePolicy, { mode: 'public' }>): void {
  if (
    !Number.isInteger(policy.revalidateSeconds) ||
    policy.revalidateSeconds < MIN_PUBLIC_REVALIDATE_SECONDS ||
    policy.revalidateSeconds > MAX_PUBLIC_REVALIDATE_SECONDS
  ) {
    throw new Error('مدة تخزين بيانات الخادم خارج الحدود المسموحة');
  }

  if (
    !Array.isArray(policy.tags) ||
    policy.tags.length === 0 ||
    policy.tags.length > MAX_CACHE_TAGS ||
    policy.tags.some((tag) => typeof tag !== 'string' || tag.length === 0 || tag.length > 256)
  ) {
    throw new Error('وسوم تخزين بيانات الخادم غير صالحة');
  }
}

async function requestApiEnvelopeUncached(
  path: string,
  timeoutMs: number,
): Promise<ApiResponse<unknown>> {
  const safeLogPath = new URL(path, 'https://marketplat-internal.invalid').pathname;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const cloudflare = await resolveCloudflareBinding();
    let response: Response;

    if (cloudflare.contextAvailable) {
      if (!cloudflare.apiWorker) {
        // Do not fall back to workers.dev from inside a Cloudflare Worker.
        // A missing binding is a deployment/configuration error, not a reason
        // to reintroduce the Worker-to-Worker 1042 failure path.
        throw new Error('API_WORKER service binding is unavailable');
      }

      response = await cloudflare.apiWorker.fetch(
        new Request(`https://api/api/v1${path}`, {
          method: 'GET',
          headers: { accept: 'application/json' },
          redirect: 'manual',
          signal: controller.signal,
        }),
      );
    } else {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method: 'GET',
        cache: 'no-store',
        headers: { accept: 'application/json' },
        signal: controller.signal,
        redirect: 'manual',
      });
    }

    if (!response.ok) {
      console.error(`[serverApiFetch] HTTP ${response.status} for ${safeLogPath}`);
      throw new Error(`طلب الخادم فشل (${response.status})`);
    }

    let payload: unknown;
    try {
      payload = await response.json();
    } catch {
      console.error(`[serverApiFetch] Invalid JSON for ${safeLogPath}`);
      throw new Error('استجابة الخادم غير صالحة');
    }

    if (
      payload === null ||
      typeof payload !== 'object' ||
      Array.isArray(payload) ||
      (payload as Record<string, unknown>).success !== true ||
      typeof (payload as Record<string, unknown>).message !== 'string'
    ) {
      console.error(`[serverApiFetch] Invalid API envelope for ${safeLogPath}`);
      throw new Error('استجابة الخادم غير صالحة');
    }

    return payload as ApiResponse<unknown>;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith('طلب الخادم فشل')) throw error;
    if (error instanceof Error && error.message === 'استجابة الخادم غير صالحة') throw error;

    const errorName = error instanceof Error ? error.name : 'UnknownError';
    console.error(`[serverApiFetch] Network/runtime failure for ${safeLogPath} (${errorName})`);
    throw new Error('فشل الاتصال بالخادم');
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Fetch a read-only API resource from a Server Component.
 *
 * `no-store` is explicit for identity-sensitive or side-effecting endpoints.
 * Public resources must provide at least one invalidation tag and a bounded
 * revalidation interval. `unstable_cache` stores the resolved envelope in
 * Next's Data Cache and makes it available to later requests.
 */
export async function fetchServerApi<T>(
  path: string,
  policy: ServerApiCachePolicy,
): Promise<ApiResponse<T>> {
  const normalizedPath = normalizeApiPath(path);
  const timeoutMs = policy.timeoutMs ?? DEFAULT_SERVER_API_TIMEOUT_MS;

  if (!Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 30_000) {
    throw new Error('مهلة طلب الخادم غير صالحة');
  }

  if (policy.mode === 'no-store') {
    return await requestApiEnvelope(normalizedPath, timeoutMs) as ApiResponse<T>;
  }

  validatePublicCachePolicy(policy);
  const allowedTags = new Set(getPublicApiCacheTags(normalizedPath));
  if (policy.tags.some((tag) => !allowedTags.has(tag)) || [...allowedTags].some((tag) => !policy.tags.includes(tag))) {
    throw new Error('سياسة التخزين لا تطابق نطاق API العام المسموح');
  }
  const tags = [...new Set(policy.tags)];
  const cachedRead = unstable_cache(
    async (requestPath: string) => requestApiEnvelope(requestPath, timeoutMs),
    [
      SERVER_API_CACHE_VERSION,
      String(policy.revalidateSeconds),
      ...tags,
    ],
    {
      revalidate: policy.revalidateSeconds,
      tags,
    },
  );

  return await cachedRead(normalizedPath) as ApiResponse<T>;
}
