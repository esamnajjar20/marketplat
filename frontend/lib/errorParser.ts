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
import { getErrorMessage, type ErrorMeta } from './i18n/ar/errors';
import {
  translateFieldIssue,
  translateLiteralFallback,
  type FieldIssueMeta,
} from './i18n/ar/fieldErrors';

export interface ParsedError {
  message:      string;
  statusCode:   number;
  /**
   * The backend's stable machine-readable code (see
   * backend/src/shared/errors/errorCodes.ts), when the response included
   * one. UI code that needs to distinguish between error cases (e.g.
   * which form field a 400 refers to) should switch on this, never on
   * `message` — the Arabic message text is free to be reworded without
   * that being a breaking change for such comparisons.
   */
  code?: string;
  /**
   * Field-keyed validation messages, when the failure was a Zod
   * validation error (400 with a body.errors object). Keys are the
   * bare field name (e.g. "title", "sortBy") — the "body."/"query."/
   * "params." prefix Zod's path produces from the wrapped schema shape
   * (`z.object({ body: z.object({...}) })`) is stripped, since it reflects
   * how the backend nests its schemas, not anything the UI's field names
   * should ever need to know about.
   *
   * FIX I18N-01: values are now Arabic, translated from the backend's
   * structured errorMeta (Zod issue code/params) — never the raw
   * English Zod message. See i18n/ar/fieldErrors.ts.
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

/**
 * FIX I18N-01: parses the structured errorMeta object (see
 * error.middleware.ts) into the same field-keyed shape as `errors`,
 * so it can be zipped against `errors` by (field, index) below.
 */
function parseFieldErrorMeta(raw: unknown): Record<string, FieldIssueMeta[]> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const entries = Object.entries(raw as Record<string, unknown>)
    .filter((entry): entry is [string, unknown[]] => Array.isArray(entry[1]))
    .map(([field, issues]) => [
      stripWrapperPrefix(field),
      issues
        .filter((i): i is FieldIssueMeta => !!i && typeof i === 'object' && typeof (i as FieldIssueMeta).code === 'string')
    ] as [string, FieldIssueMeta[]]);
  return entries.length > 0 ? Object.fromEntries(entries) : undefined;
}

/**
 * FIX I18N-01: field-level validation messages are now translated to
 * Arabic before reaching the UI. Previously this only stripped HTML
 * and the Zod wrapper prefix, passing the backend's raw English
 * `issue.message` straight through — every form consuming
 * `getFieldError()` showed English text under Arabic labels,
 * including Zod's own untranslated default wording for fields with no
 * custom message (e.g. "city").
 *
 * Preferred path: translate each issue from the structured
 * `errorMeta` (Zod issue code + params) that error.middleware.ts now
 * sends alongside `errors` — this covers every field generically,
 * custom message or not. If `errorMeta` is missing for a given
 * message (e.g. an older cached response shape), falls back to a
 * small literal-string table, and only as an absolute last resort
 * keeps the sanitised English so the UI never renders nothing.
 */
function parseFieldErrors(
  raw: unknown,
  rawMeta: unknown,
): Record<string, string[]> | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const metaByField = parseFieldErrorMeta(rawMeta);

  const entries = Object.entries(raw as Record<string, unknown>)
    .filter((entry): entry is [string, string[]] => Array.isArray(entry[1]))
    .map(([rawField, messages]) => {
      const field = stripWrapperPrefix(rawField);
      const issues = metaByField?.[field];
      const translated = messages
        .filter((m): m is string => typeof m === 'string')
        .map((m, i) => {
          const issue = issues?.[i];
          const arabic = issue
            ? translateFieldIssue(field, issue)
            : translateLiteralFallback(m);
          return sanitiseMsg(arabic);
        });
      return [field, translated] as [string, string[]];
    });
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
  // FIX AUTH-MSG-01: apiClient's response interceptor (client.ts) already
  // calls parseApiError itself before rejecting — every promise rejection
  // that comes out of apiClient is already a ParsedError, never a raw
  // AxiosError. Call sites that catch that rejection and call
  // parseApiError(err) again (useLogin/useRegister's onError, LoginForm,
  // RegisterForm, and other mutation hooks) were feeding an already-parsed
  // object back in: axios.isAxiosError() is false for it, and
  // `error instanceof Error` is also false (it's a plain
  // {message, statusCode, ...} object literal, not a thrown Error) — so
  // every double-parsed error fell through to the final generic
  // "حدث خطأ غير متوقع" fallback below, discarding the specific Arabic
  // message, the `code`, and any `fieldErrors` already resolved on the
  // first pass. Recognising and returning an already-parsed error
  // unchanged fixes every such call site at once, without changing
  // behaviour anywhere a raw AxiosError/Error is passed in for the
  // first time.
  if (
    error &&
    typeof error === 'object' &&
    !(error instanceof Error) &&
    typeof (error as Record<string, unknown>).message === 'string' &&
    typeof (error as Record<string, unknown>).statusCode === 'number'
  ) {
    return error as ParsedError;
  }

  if (axios.isAxiosError(error)) {
    const status  = error.response?.status  ?? 0;
    const data    = error.response?.data    as Record<string, unknown>;
    const headers = error.response?.headers ?? {};

    // Stable machine-readable code from error.middleware.ts (always present
    // on API error responses; CODE_BY_STATUS gives it a value even for
    // errors that didn't set one explicitly). Kept optional here anyway —
    // a network error or a non-API 4xx from some other layer won't have it.
    const code: string | undefined = typeof data?.code === 'string' ? data.code : undefined;
    const meta: ErrorMeta | undefined =
      data?.meta && typeof data.meta === 'object' ? (data.meta as ErrorMeta) : undefined;

    // Looked up from our own static Arabic dictionary — never derived from
    // the backend's English `message` text, so this can't reintroduce the
    // backendMsg-leak problem for statuses (401/5xx) that must never show
    // server-authored text.
    const codeMsg = getErrorMessage(code, meta);

    // Use the backend's message when available — sanitised. Only used as a
    // fallback when `code` didn't resolve to a known translation.
    const rawMsg: string | undefined =
      typeof data?.message === 'string' ? data.message : undefined;
    const backendMsg = rawMsg ? sanitiseMsg(rawMsg) : undefined;

    // FIX M-1: only ever populated on 400s (the only status error.middleware.ts
    // attaches `errors` to — ZodError). Deliberately not attempted for 4xx/5xx
    // in general so a coincidental `errors`-shaped field in some other error
    // body isn't misread as field-level validation detail.
    const fieldErrors = status === 400 ? parseFieldErrors(data?.errors, data?.errorMeta) : undefined;

    switch (status) {
      case 400:
        return { message: codeMsg ?? backendMsg ?? 'البيانات المرسلة غير صحيحة', statusCode: 400, code, fieldErrors };
      case 401:
        // Deliberately never falls back to backendMsg — only a known code's
        // static Arabic translation, or the generic session-expired string.
        // A 401 body's English message may carry session/token internals
        // that must never reach the UI.
        return { message: codeMsg ?? 'انتهت جلستك، يرجى تسجيل الدخول مجدداً', statusCode: 401, code };
      case 403:
        return { message: codeMsg ?? backendMsg ?? 'لا تملك صلاحية لهذا الإجراء', statusCode: 403, code };
      case 404:
        return { message: codeMsg ?? backendMsg ?? 'العنصر المطلوب غير موجود', statusCode: 404, code };
      case 409:
        return { message: codeMsg ?? backendMsg ?? 'يوجد تعارض في البيانات', statusCode: 409, code };
      case 422:
        return { message: codeMsg ?? backendMsg ?? 'تحقق من صحة البيانات المدخلة', statusCode: 422, code };
      case 429: {
        if (codeMsg) return { message: codeMsg, statusCode: 429, code };
        const retryAfter = headers[RETRY_AFTER_HEADER];
        const parsed      = retryAfter ? Number(retryAfter) : NaN;
        const minutes    = Number.isFinite(parsed) ? Math.ceil(parsed / 60) : 15;
        return {
          message:    `طلبات كثيرة جداً، يرجى المحاولة بعد ${minutes} دقيقة`,
          statusCode: 429,
          code,
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
        // Same rule as 401: never backendMsg, even if a code happens to be
        // unrecognised — only the static dictionary or the hardcoded string.
        return { message: codeMsg ?? 'خطأ في الخادم، يرجى المحاولة لاحقاً', statusCode: 500, code };
      default:
        if (!error.response) {
          return { message: 'تعذّر الاتصال بالخادم، تحقق من اتصالك بالإنترنت', statusCode: 0 };
        }
        if (status >= 500) {
          return { message: codeMsg ?? 'خطأ في الخادم، يرجى المحاولة لاحقاً', statusCode: status, code };
        }
        // For unexpected non-5xx status codes, use backendMsg but still sanitised.
        return { message: codeMsg ?? backendMsg ?? 'حدث خطأ غير متوقع', statusCode: status, code };
    }
  }

  if (error instanceof Error) {
    // SEC-FIX-03: cap generic Error messages too.
    return { message: sanitiseMsg(error.message) || 'حدث خطأ غير متوقع', statusCode: 0 };
  }

  return { message: 'حدث خطأ غير متوقع', statusCode: 0 };
}
