import { getCsrfToken } from '@/lib/csrf';
import { useAuthStore } from '@/store/auth.store';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';

function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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
	const maxAttempts = 3;
	let lastError: unknown;
	let refreshed = false;
	for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
		try {
			return await _requestInner(url, options);
		} catch (error) {
			lastError = error;
			const status = (error as { status?: number }).status;
			if (status === 401 && !refreshed) {
				refreshed = true;
				await refreshOnce();
				continue;
			}
			const isRetryable = !status || (status >= 500 && status < 600);
			if (!isRetryable || attempt === maxAttempts) throw error;
			await sleep(1000 * Math.pow(2, attempt - 1));
		}
	}
	throw lastError;
}
export const fetchClient = {
	get: (url: string, options?: RequestInit) => request(url, { ...options, method: 'GET' }),
	post: (url: string, body?: unknown, options?: RequestInit) => request(url, { ...options, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
	put: (url: string, body?: unknown, options?: RequestInit) => request(url, { ...options, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
	patch: (url: string, body?: unknown, options?: RequestInit) => request(url, { ...options, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
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