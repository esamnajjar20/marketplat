/**
 * Stable, machine-readable error codes returned alongside the English
 * `message` in every API error response (see error.middleware.ts).
 *
 * The frontend should switch/map on `error.code`, never on `error.message`
 * — the English message text is free to change without being a breaking
 * change for clients, as long as the code stays the same. New codes
 * should be added here rather than left as bare string literals at call
 * sites, so the full set of codes the API can return stays discoverable
 * in one place.
 */
export const ErrorCode = {
  // Generic / fallback
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  CONFLICT: 'CONFLICT',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',

  // Auth
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_DEACTIVATED: 'ACCOUNT_DEACTIVATED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  TOO_MANY_ATTEMPTS_FROM_IP: 'TOO_MANY_ATTEMPTS_FROM_IP',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  SESSION_NOT_FOUND: 'SESSION_NOT_FOUND',
  EMAIL_ALREADY_EXISTS: 'EMAIL_ALREADY_EXISTS',
  PHONE_ALREADY_EXISTS: 'PHONE_ALREADY_EXISTS',
  INVALID_RESET_TOKEN: 'INVALID_RESET_TOKEN',
  CURRENT_PASSWORD_INVALID: 'CURRENT_PASSWORD_INVALID',

  // Users
  USER_NOT_FOUND: 'USER_NOT_FOUND',
  NO_FILE_ATTACHED: 'NO_FILE_ATTACHED',

  // Admin
  CANNOT_DEACTIVATE_SELF: 'CANNOT_DEACTIVATE_SELF',
  CANNOT_DEACTIVATE_LAST_ADMIN: 'CANNOT_DEACTIVATE_LAST_ADMIN',
  CANNOT_DEMOTE_SELF: 'CANNOT_DEMOTE_SELF',
  CANNOT_DEMOTE_LAST_ADMIN: 'CANNOT_DEMOTE_LAST_ADMIN',
  CONCURRENT_UPDATE_CONFLICT: 'CONCURRENT_UPDATE_CONFLICT',

  // Ads
  AD_NOT_FOUND: 'AD_NOT_FOUND',
  AD_LIMIT_REACHED: 'AD_LIMIT_REACHED',

  // Categories
  CATEGORY_NOT_FOUND: 'CATEGORY_NOT_FOUND',

  // Uploads
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',

  // Bookings / appointments
  BOOKING_NOT_FOUND: 'BOOKING_NOT_FOUND',
} as const;

export type ErrorCodeValue = (typeof ErrorCode)[keyof typeof ErrorCode];
