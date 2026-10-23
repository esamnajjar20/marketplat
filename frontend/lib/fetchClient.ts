const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
let sessionRevoked = false;
let sharedRefreshPromise: unknown | null = null;

function getCsrfToken(): string | null {
	if (typeof document === 'undefined') return null;
	const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
let refreshPromise: Promise<void> | null = null;
async function _doRefresh(): Promise<void> {
	const res = await fetch(API_BASE + '/api/auth/refresh', {
		method: 'POST',
		credentials: 'include',
		headers: { 'Content-Type': 'application/json' },
	});
	if (!res.ok) throw new Error('Refresh failed');
}
function refreshOnce(): Promise<void> {
	if (!refreshPromise) {
		refreshPromise = _doRefresh().finally(() => { refreshPromise = null; });
	}
	return refreshPromise;
}
async function _requestInner(url: string, options: RequestInit = {}): Promise<unknown> {
	const headers: Record<string, string> = {
		'Content-Type': 'application/json',
		...(options.headers as Record<string, string> | undefined),
	};
	const csrf = getCsrfToken();
	if (csrf && options.method && options.method !== 'GET') {
		headers['X-CSRF-Token'] = csrf;
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
/** Resets the sessionRevoked flag so subsequent 401s resume the normal /auth/refresh path. */
export function resumeSession(): void {
  sessionRevoked = false;
}

/** T735 — read accessor for the session-revoked flag. */
export function isSessionRevoked(): boolean {
  return sessionRevoked;
}

/** Refreshes the session using fetchClient, with deduplication via sharedRefreshPromise. */
export async function refreshSessionShared(): Promise<unknown> {
  if (sharedRefreshPromise) {
    return sharedRefreshPromise;
  }

  sharedRefreshPromise = (async () => {
    const res = await fetchClient.post('/api/auth/refresh');
    return res;
  })().finally(() => {
    sharedRefreshPromise = null;
  });

  return sharedRefreshPromise;
}
export default fetchClient;