const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? '';
function getCsrfToken(): string | null {
	if (typeof document === 'undefined') return null;
	const match = document.cookie.match(/(?:^|;\s*)csrf_token=([^;]+)/);
	return match?.[1] ? decodeURIComponent(match[1]) : null;
}
async function request(url: string, options: RequestInit = {}): Promise<unknown> {
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
export const fetchClient = {
	get: (url: string, options?: RequestInit) => request(url, { ...options, method: 'GET' }),
	post: (url: string, body?: unknown, options?: RequestInit) => request(url, { ...options, method: 'POST', body: body ? JSON.stringify(body) : undefined }),
	put: (url: string, body?: unknown, options?: RequestInit) => request(url, { ...options, method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
	patch: (url: string, body?: unknown, options?: RequestInit) => request(url, { ...options, method: 'PATCH', body: body ? JSON.stringify(body) : undefined }),
	delete: (url: string, options?: RequestInit) => request(url, { ...options, method: 'DELETE' }),
};
export default fetchClient;