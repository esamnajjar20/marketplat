/**
 * Compatibility export for the shared TTL used by admin-managed reference trees.
 * The only editable source is shared/cache-policy.json.
 */
import { CACHE_POLICY } from './cachePolicy';

export const REFERENCE_DATA_REDIS_TTL_SECONDS = CACHE_POLICY.server.referenceTreeTtlSec;
