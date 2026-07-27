/**
 * Converts Axios / API errors into human-readable Arabic messages.
 * Returns a consistent { message, statusCode } shape for use in toasts and UI.
 *
 * SEC-FIX-03: backendMsg is now sanitised before use:
 *   - Stripped of any HTML tags (backend validation errors occasionally include them).
 *   - Capped at 200 characters to prevent oversized error UI and information leakage.
 *   - 5xx messages always use a hardcoded Arabic string — never the raw server error.
 *
 * FIX M-1: every Zod validation failure on the backend (error.middleware.ts)
 * has always included a field-level `errors: Record<string, string[]>` object
 * alongside the generic `message: 'Validation failed'` — but nothing on the
 * frontend ever read it (confirmed: zero references to `.errors` anywhere in
 * the codebase before this fix). Every validation error in every form
 * surfaced as the same unhelpful generic toast, with no indication of which
 * field was actually wrong. ParsedError now carries the parsed, field-keyed
 * errors (with the Zod path prefix like "body." / "query." stripped, since
 * that's an internal schema-wrapping detail the UI never needs), and
 * getFieldError() gives forms a one-line way to consume it.
 */
import axios from 'axios';

export interface ParsedError {
  message:      string;
  statusCode:   number;
  /**
   * Field-keyed validation messages from the backend, when the failure was
   * a Zod validation error (400 with a body.errors object). Keys are the
   * bare field name (e.g. "title", "sortBy") — the "body."/"query."/
   * "params." prefix Zod's path produces from the wrapped schema shape
   * (`z.object({ body: z.object({...}) })`) is stripped, since it reflects
   * how the backend nests its schemas, not anything the UI's field names
   * should ever need to know about.
   */
  fieldErrors?: Record<string, string[]>;
}

/** Backend rate-limit headers */
const RETRY_AFTER_HEADER = 'retry-after';

/** Max length for any backend-supplied error message shown in the UI. */
const MAX_MSG_LENGTH = 200;

/**
 * Strip HTML tags and truncate to MAX_MSG_LENGTH.
 * JSX auto-escapes text nodes, but belt-and-suspenders for any future
 * path that renders this string outside of JSX (e.g. toast lib innerHTML).
 */
function sanitiseMsg(msg: string): string {
  return msg
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '') // strip script/style blocks incl. content
    .replace(/<[^>]*>/g, '')   // strip remaining HTML tags
    .trim()
    .slice(0, MAX_MSG_LENGTH);
}

/**
 * Strips the outer Zod wrapper segment ("body", "query", "params") from a
 * dotted field path, e.g. "body.title" -> "title", "query.sortBy" -> "sortBy".
 * A path that is just "body" (a whole-object-level error) or already has no
 * recognised prefix is left as-is, falling back to "general" only when Zod's
 * own path was empty (matches error.middleware.ts's `e.path.join('.') || 'general'`).
 */
const WRAPPER_SEGMENTS = new Set(['body', 'query', 'params']);
function stripWrapperPrefix(field: string): string {
  const parts = field.split('.');
  if (parts.length > 1 && WRAPPER_SEGMENTS.has(parts[0] ?? '')) {
    return parts.slice(1).join('.');
  }
  return field;
}

function parseFieldErrors(raw: unknown): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const entries = Object.entries(raw as Record<string, unknown>)
    .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
    .map(([field, messages]) => [
      stripWrapperPrefix(field),
      messages.filter((m): m is string => typeof m === 'string').map(sanitiseMsg),
    ] as [string, string[]]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * Convenience accessor for forms: the first backend validation message for
 * a given field, or undefined if there isn't one. Forms typically merge this
 * with their own client-side validation, e.g.:
 *   error={errors.title ?? getFieldError(serverError, 'title')}
 */
export function getFieldError(error: ParsedError | undefined, field: string): string | undefined {
  return error?.fieldErrors?.[field]?.[0];
}

export function parseApiError(error: unknown): ParsedError {
  if (axios.isAxiosError(error)) {
    const status  = error.response?.status  ?? 0;
    const data    = error.response?.data    as any;
    const headers = error.response?.headers ?? {};

    // Use the backend's message when available — sanitised.
    const rawMsg: string | undefined =
      typeof data?.message === 'string' ? data.message : undefined;
    const backendMsg = rawMsg ? sanitiseMsg(rawMsg) : undefined;

    // FIX M-1: only ever populated on 400s (the only status error.middleware.ts
    // attaches `errors` to — ZodError). Deliberately not attempted for 4xx/5xx
    // in general so a coincidental `errors`-shaped field in some other error
    // body isn't misread as field-level validation detail.
    const fieldErrors = status === 400 ? parseFieldErrors(data?.errors) : undefined;

    switch (status) {
      case 400:
        return { message: backendMsg ?? 'البيانات المرسلة غير صحيحة', statusCode: 400, fieldErrors };
      case 401:
        return { message: 'انتهت جلستك، يرجى تسجيل الدخول مجدداً', statusCode: 401 };
      case 403:
        return { message: backendMsg ?? 'لا تملك صلاحية لهذا الإجراء', statusCode: 403 };
      case 404:
        return { message: backendMsg ?? 'العنصر المطلوب غير موجود', statusCode: 404 };
      case 409:
        return { message: backendMsg ?? 'يوجد تعارض في البيانات', statusCode: 409 };
      case 422:
        return { message: backendMsg ?? 'تحقق من صحة البيانات المدخلة', statusCode: 422 };
      case 429: {
        const retryAfter = headers[RETRY_AFTER_HEADER];
        const parsed      = retryAfter ? Number(retryAfter) : NaN;
        const minutes    = Number.isFinite(parsed) ? Math.ceil(parsed / 60) : 15;
        return {
          message:    `طلبات كثيرة جداً، يرجى المحاولة بعد ${minutes} دقيقة`,
          statusCode: 429,
        };
      }
      // FIX SEC-04: this used to only special-case `case 500` — status codes
      // 501-599 (502 Bad Gateway, 503 Service Unavailable, 504 Gateway
      // Timeout, etc., all realistic for a reverse-proxied/load-balanced
      // deployment) fell through to `default` below and could leak a
      // sanitised-but-still-server-authored backendMsg. The comment atop
      // this file already claimed "5xx messages always use a hardcoded
      // Arabic string" — this makes that actually true for every 5xx, not
      // only 500.
      case 500:
        return { message: 'خطأ في الخادم، يرجى المحاولة لاحقاً', statusCode: 500 };
      default:
        if (!error.response) {
          return { message: 'تعذّر الاتصال بالخادم، تحقق من اتصالك بالإنترنت', statusCode: 0 };
        }
        if (status >= 500) {
          return { message: 'خطأ في الخادم، يرجى المحاولة لاحقاً', statusCode: status };
        }
        // For unexpected non-5xx status codes, use backendMsg but still sanitised.
        return { message: backendMsg ?? 'حدث خطأ غير متوقع', statusCode: status };
    }
  }

  if (error instanceof Error) {
    // SEC-FIX-03: cap generic Error messages too.
    return { message: sanitiseMsg(error.message) || 'حدث خطأ غير متوقع', statusCode: 0 };
  }

  return { message: 'حدث خطأ غير متوقع', statusCode: 0 };
}
