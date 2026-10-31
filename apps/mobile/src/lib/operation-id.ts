/** Create a backend-compatible idempotency key for one user intent. */
export function createMobileOperationId(prefix: string): string {
  const safePrefix = prefix.replace(/[^A-Za-z0-9._:-]/g, '-').slice(0, 24) || 'mobile';
  return `${safePrefix}-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}
