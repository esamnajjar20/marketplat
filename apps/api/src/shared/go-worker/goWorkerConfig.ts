/**
 * Single source for the Go worker connection settings that were previously
 * re-read (and re-normalised) with identical code in 11 places.
 * Read per call on purpose: tests and runtime config changes set env vars
 * after module load, so values must not be frozen at import time.
 */
export function getGoWorkerBaseUrl(): string | undefined {
  return process.env.GO_WORKER_URL?.trim().replace(/\/+$/, '');
}

export function getGoWorkerToken(): string | undefined {
  return process.env.GO_WORKER_TOKEN?.trim();
}
