import { AppError } from './AppError';

/**
 * PROD-FIX-12: used when a circuit breaker (see
 * shared/utils/circuitBreaker.ts) rejects a call because an external
 * dependency (Cloudinary, in the current usage) is currently OPEN —
 * i.e. failing repeatedly and being given a cooldown window rather
 * than being hammered further. 503 (not 500) is the correct status
 * here: this is not "the server is broken," it's "a specific external
 * service this request depends on is temporarily unavailable, retry
 * shortly" — a real, meaningful distinction for a client to act on
 * (e.g. show "try again in a moment" rather than a generic error).
 */
export class ServiceUnavailableError extends AppError {
  constructor(message = 'Service temporarily unavailable, please try again shortly') {
    super(message, 503);
  }
}
