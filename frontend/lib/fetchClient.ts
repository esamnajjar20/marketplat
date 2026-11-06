import { getCsrfToken } from '@/lib/csrf';
import { useAuthStore } from '@/store/auth.store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

const SAFE_HTTP_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function createAbortError(signal?: AbortSignal): Error {
	if (signal?.reason instanceof Error) return signal.reason;
	if (typeof DOMException !== 'undefined') {
		return new DOMException('The operation was aborted', 'AbortError');
	}
	const error = new Error('The operation was aborted');
	error.name = 'AbortError';
	return error;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
	if (signal?.aborted) return Promise.reject(createAbortError(signal));
	return new Promise((resolve, reject) => {
		const cleanup = () => signal?.removeEventListener('abort', onAbort);
		const timer = setTimeout(() => {
			cleanup();
			resolve();
		}, ms);
		const onAbort = () => {
			clearTimeout(timer);
			cleanup();
			reject(createAbortError(signal));
		};
		signal?.addEventListener('abort', onAbort, { once: true });
		if (signal?.aborted) onAbort();
	});
}

/**
 * Stop waiting for a shared operation when this caller is cancelled without
 * aborting the shared operation itself. Refresh is shared across requests, so
 * one navigation must not cancel token rotation needed by another request.
 */
function waitForPromiseWithSignal<T>(promise: Promise<T>, signal?: AbortSignal | null): Promise<T> {
	if (!signal) return promise;
	if (signal.aborted) return Promise.reject(createAbortError(signal));

	return new Promise((resolve, reject) => {
		let settled = false;
		const cleanup = () => signal.removeEventListener('abort', onAbort);
		const finish = (callback: () => void) => {
			if (settled) return;
			settled = true;
			cleanup();
			callback();
		};
		const onAbort = () => finish(() => reject(createAbortError(signal)));

		signal.addEventListener('abort', onAbort, { once: true });
		promise.then(
			(value) => finish(() => resolve(value)),
			(error) => finish(() => reject(error)),
		);
		// Close the race where the signal was aborted while the listener was added.
		if (signal.aborted) onAbort();
	});
}
let refreshPromise: Promise<unknown> | null = null;

/** Use the same deduplicated Axios refresh flow as the rest of the web app.
 * It updates both the in-memory Bearer token and the rotated CSRF token before
 * the original fetch request is retried. */
function refreshOnce(): Promise<unknown> {
	if (!refreshPromise) {
		refreshPromise = import('@/api/client')
			.then(({ refreshSessionShared }) => refreshSessionShared())
			.finally(() => { refreshPromise = null; });
	}
	return refreshPromise;
}
async function _requestInner(url: string, options: RequestInit = {}): Promise<unknown> {
	const headers = new Headers(options.headers);
	if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
	const method = (options.method ?? 'GET').toUpperCase();
	const accessToken = useAuthStore.getState().accessToken;
	if (accessToken) headers.set('Authorization', `Bearer ${accessToken}`);
	const isUnsafeMethod = !['GET', 'HEAD', 'OPTIONS'].includes(method);
	if (isUnsafeMethod) {
		// Keep every API client on the same double-submit CSRF contract.
		// The backend cookie is named `csrfToken` (camelCase); do not
		// duplicate cookie parsing here or it can silently drift again.
		const csrf = getCsrfToken();
		if (csrf) headers.set('X-CSRF-Token', csrf);
	}
	const response = await fetch(API_BASE + url, {
		...options,
		headers,
		credentials: 'include',
	});
	if (!response.ok) {
		let body: unknown = null;
		try { body = await response.json(); } catch { body = null; }
		const err = new Error(response.statusText || 'Request failed') as Error & { status: number; data?: unknown };
		err.status = response.status;
		err.data = body;
		throw err;
	}
	if (response.status === 204) return undefined;
	try { return await response.json(); } catch { return undefined; }
}
async function request(url: string, options: RequestInit = {}): Promise<unknown> {
	const method = (options.method ?? 'GET').toUpperCase();
	const canRetryNetworkFailure = SAFE_HTTP_METHODS.has(method);
	// A lost response does not prove that a write was not committed. Retry
	// network/5xx failures only for safe methods; mutations may be replayed
	// only by an endpoint-specific idempotency contract, not this generic client.
	const maxNetworkAttempts = canRetryNetworkFailure ? 3 : 1;
	let networkAttempts = 0;
	let refreshed = false;

	while (true) {
		try {
			return await _requestInner(url, options);
		} catch (error) {
			const status = (error as { status?: number }).status;
			if (status === 401 && !refreshed && !options.signal?.aborted) {
				refreshed = true;
				await waitForPromiseWithSignal(refreshOnce(), options.signal);
				// The shared refresh may have completed at the same instant as a
				// route change. Never dispatch a new request for an aborted caller.
				if (options.signal?.aborted) throw createAbortError(options.signal);
				continue;
			}

			const isRetryable = !status || (status >= 500 && status < 600);
			if (
				!canRetryNetworkFailure ||
				!isRetryable ||
				options.signal?.aborted
			) {
				throw error;
			}

			networkAttempts += 1;
			if (networkAttempts >= maxNetworkAttempts) throw error;
			await sleep(1000 * Math.pow(2, networkAttempts - 1), options.signal ?? undefined);
		}
	}
}
export const fetchClient = {
	get: (url: string, options?: RequestInit) => request(url, { ...options, method: 'GET' }),
	post: (url: string, body?: unknown, options?: RequestInit) => request(url, { ...options, method: 'POST', body: body !== undefined ? JSON.stringify(body) : undefined }),
	put: (url: string, body?: unknown, options?: RequestInit) => request(url, { ...options, method: 'PUT', body: body !== undefined ? JSON.stringify(body) : undefined }),
	patch: (url: string, body?: unknown, options?: RequestInit) => request(url, { ...options, method: 'PATCH', body: body !== undefined ? JSON.stringify(body) : undefined }),
	delete: (url: string, options?: RequestInit & { data?: unknown }) => {
    const { data, ...rest } = options ?? {};
    return request(url, {
      ...rest,
      method: 'DELETE',
      body: data !== undefined ? JSON.stringify(data) : rest.body,
    });
  },
};
/**
 * Compatibility entry point for modules that historically imported refresh
 * from fetchClient. The canonical coordinator owns cookie rotation, Bearer
 * token state, CSRF state, refresh deduplication, and logout-race protection.
 */
export async function refreshSessionShared(): Promise<unknown> {
	const { refreshSessionShared: refresh } = await import('@/api/client');
	return refresh();
}
export default fetchClient;