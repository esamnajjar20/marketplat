/** Explicit allowlist for durable offline mutations. Unknown endpoints fail closed. */
export function isOfflineMutationQueueAllowed(input: { url: string; method: string; operationId?: string | null }): boolean {
  let url: URL;
  try { url = new URL(input.url, typeof window !== 'undefined' ? window.location.origin : 'https://marketplat.invalid'); }
  catch { return false; }
  if (!url.pathname.startsWith('/api/v1/')) return false;
  const method = input.method.toUpperCase();
  if (['GET', 'HEAD', 'OPTIONS'].includes(method)) return false;
  if (/\/(auth|payments|checkout|appointments)(?:\/|$)/i.test(url.pathname)) return false;
  if (/\/(analytics|presence|heartbeat|csrf)(?:\/|$)/i.test(url.pathname)) return false;
  if (/\/favorites(?:\/|$)/i.test(url.pathname)) return false; // toggle endpoints are not idempotent
  if (/\/(messages|conversations)\/[^/]+\/messages(?:\/(?:image|file|audio))?$/i.test(url.pathname)) return Boolean(input.operationId);
  if (/\/sales$/i.test(url.pathname)) return method === 'POST' && Boolean(input.operationId);
  // Only exact create endpoints are allowed here; edit flows use a feature-specific local draft
  // publisher, and deletes/status transitions must never be replayed blindly.
  if (/\/(ads|products|service-listings|requests|service-requests)$/i.test(url.pathname)) {
    return method === 'POST' && Boolean(input.operationId);
  }
  return false;
}
