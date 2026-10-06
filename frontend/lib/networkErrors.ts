/**
 * Shared network-error detection for HTTP and multipart requests.
 *
 * A network failure has no usable HTTP response. Axios may surface it as
 * ERR_NETWORK, ETIMEDOUT, ECONNABORTED, or as an error carrying a request
 * without a response. App-specific offline errors may expose statusCode 0.
 */
export function isNetworkFailure(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;

  const value = error as {
    response?: unknown;
    request?: unknown;
    statusCode?: number;
    code?: string;
  };

  if (value.response != null) return false;
  if (value.statusCode === 0) return true;

  return (
    value.code === 'NETWORK_ERROR' ||
    value.code === 'ERR_NETWORK' ||
    value.code === 'ECONNABORTED' ||
    value.code === 'ETIMEDOUT' ||
    value.request != null
  );
}
