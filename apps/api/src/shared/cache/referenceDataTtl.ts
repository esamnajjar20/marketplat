/**
 * Single Redis TTL for admin-managed reference trees (ad / product / service
 * categories). These keys are also invalidated explicitly on every admin
 * mutation, so the TTL is only a safety net. Keep the three category services
 * on this one constant so they cannot drift apart.
 */
export const REFERENCE_DATA_REDIS_TTL_SECONDS = 60 * 60;
