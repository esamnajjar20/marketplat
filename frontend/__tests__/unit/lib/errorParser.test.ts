/**
 * __tests__/unit/lib/errorParser.test.ts
 *
 * Coverage targets:
 *  - Every HTTP status code branch (400, 401, 403, 404, 409, 422, 429, 500, other)
 *  - Network error (no response)
 *  - Non-Axios Error instance
 *  - Unknown throw value (string, object, null)
 *  - sanitiseMsg: HTML stripping, 200-char truncation
 *  - 429 Retry-After header parsing (seconds → minutes)
 *  - 5xx never leaks backend message
 *  - 401 never leaks backend message (session details)
 */
import { describe, it, expect } from 'vitest';
import axios, { AxiosError, AxiosHeaders } from 'axios';
import { parseApiError, getFieldError, type ParsedError } from '@/lib/errorParser';

// ── Helper ────────────────────────────────────────────────────────

function makeAxiosError(
  status: number,
  message?: string,
  headers: Record<string, string> = {},
  errors?: Record<string, string[]>,
  code?: string,
  meta?: Record<string, unknown>,
): AxiosError {
  const response = {
    status,
    statusText: String(status),
    data:    {
      ...(message !== undefined && { message }),
      ...(errors && { errors }),
      ...(code !== undefined && { code }),
      ...(meta && { meta }),
    },
    headers: new AxiosHeaders(headers),
    config:  { headers: new AxiosHeaders() } as AxiosError['config'],
  };
  const err = new AxiosError(
    'Request failed',
    String(status),
    { headers: new AxiosHeaders() } as AxiosError['config'],
    {},
    response as AxiosError['response'],
  );
  return err;
}

function makeNetworkError(): AxiosError {
  // No .response → treated as network error
  const err = new AxiosError('Network Error', 'ERR_NETWORK', {
    headers: new AxiosHeaders(),
  } as AxiosError['config']);
  return err;
}

// ── Status code branches ──────────────────────────────────────────

describe('parseApiError — HTTP status codes', () => {
  it('400 returns backend message when provided', () => {
    const err = makeAxiosError(400, 'البريد الإلكتروني مطلوب');
    const result = parseApiError(err);
    expect(result).toEqual<ParsedError>({
      message:    'البريد الإلكتروني مطلوب',
      statusCode: 400,
    });
    // FIX M-1: no `errors` object in the response → fieldErrors is absent,
    // not an empty object — forms can rely on `?.` / `getFieldError` safely.
    expect(result.fieldErrors).toBeUndefined();
  });

  it('400 falls back to Arabic default when no backend message', () => {
    const err = makeAxiosError(400);
    expect(parseApiError(err).message).toBe('البيانات المرسلة غير صحيحة');
  });

  it('401 ALWAYS returns fixed Arabic message — never exposes backend detail', () => {
    const err = makeAxiosError(401, 'JWT expired at 2024-01-01T00:00:00Z, issued at 2023-12-31');
    const result = parseApiError(err);
    expect(result.statusCode).toBe(401);
    expect(result.message).toBe('انتهت جلستك، يرجى تسجيل الدخول مجدداً');
    // Must NOT contain any JWT internals
    expect(result.message).not.toContain('JWT');
    expect(result.message).not.toContain('expired');
    expect(result.message).not.toContain('2024');
  });

  it('401 returns same fixed message even when no backend message sent', () => {
    const err = makeAxiosError(401);
    expect(parseApiError(err).message).toBe('انتهت جلستك، يرجى تسجيل الدخول مجدداً');
  });

  it('403 returns backend message when provided', () => {
    const err = makeAxiosError(403, 'ليس لديك صلاحية');
    expect(parseApiError(err).message).toBe('ليس لديك صلاحية');
    expect(parseApiError(err).statusCode).toBe(403);
  });

  it('403 falls back to Arabic default when no backend message', () => {
    expect(parseApiError(makeAxiosError(403)).message).toBe('لا تملك صلاحية لهذا الإجراء');
  });

  it('404 returns backend message when provided', () => {
    const err = makeAxiosError(404, 'الإعلان غير موجود');
    expect(parseApiError(err).message).toBe('الإعلان غير موجود');
    expect(parseApiError(err).statusCode).toBe(404);
  });

  it('404 falls back to Arabic default when no backend message', () => {
    expect(parseApiError(makeAxiosError(404)).message).toBe('العنصر المطلوب غير موجود');
  });

  it('409 returns backend message when provided', () => {
    const err = makeAxiosError(409, 'البريد الإلكتروني مستخدم بالفعل');
    expect(parseApiError(err).message).toBe('البريد الإلكتروني مستخدم بالفعل');
    expect(parseApiError(err).statusCode).toBe(409);
  });

  it('409 falls back to Arabic default', () => {
    expect(parseApiError(makeAxiosError(409)).message).toBe('يوجد تعارض في البيانات');
  });

  it('422 returns backend message when provided', () => {
    const err = makeAxiosError(422, 'حقل الاسم إلزامي');
    expect(parseApiError(err).message).toBe('حقل الاسم إلزامي');
    expect(parseApiError(err).statusCode).toBe(422);
  });

  it('422 falls back to Arabic default', () => {
    expect(parseApiError(makeAxiosError(422)).message).toBe('تحقق من صحة البيانات المدخلة');
  });

  it('500 ALWAYS returns hardcoded Arabic message — never exposes backend error', () => {
    const err = makeAxiosError(500, 'Internal Server Error: PostgreSQL connection refused at /var/run/postgres.sock');
    const result = parseApiError(err);
    expect(result.statusCode).toBe(500);
    expect(result.message).toBe('خطأ في الخادم، يرجى المحاولة لاحقاً');
    expect(result.message).not.toContain('PostgreSQL');
    expect(result.message).not.toContain('/var');
    expect(result.message).not.toContain('Internal Server Error');
    expect(result.message).not.toContain('postgres.sock');
  });

  it('500 returns hardcoded message even when no backend message', () => {
    expect(parseApiError(makeAxiosError(500)).message).toBe('خطأ في الخادم، يرجى المحاولة لاحقاً');
  });

  // FIX SEC-04: this used to assert 503 falls through to backendMsg —
  // i.e. it asserted the leak as correct behavior. The file's own
  // top comment already claimed "5xx messages always use a hardcoded
  // Arabic string" — the code now actually does that for every 5xx,
  // not only 500.
  it('503 (other 5xx) ALWAYS returns the same hardcoded Arabic message — never exposes backend detail', () => {
    const err = makeAxiosError(503, 'Service unavailable: upstream connection refused');
    const result = parseApiError(err);
    expect(result.statusCode).toBe(503);
    expect(result.message).toBe('خطأ في الخادم، يرجى المحاولة لاحقاً');
    expect(result.message).not.toContain('upstream');
    expect(result.message).not.toContain('Service unavailable');
  });

  it('502 and 504 also use the hardcoded 5xx message', () => {
    for (const status of [502, 504]) {
      const err = makeAxiosError(status, 'Gateway detail that must not leak');
      const result = parseApiError(err);
      expect(result.statusCode).toBe(status);
      expect(result.message).toBe('خطأ في الخادم، يرجى المحاولة لاحقاً');
    }
  });

  it('unexpected status with no backend message returns generic fallback', () => {
    const err = makeAxiosError(418);
    expect(parseApiError(err).message).toBe('حدث خطأ غير متوقع');
    expect(parseApiError(err).statusCode).toBe(418);
  });
});

// ── code-based translation (data.code from error.middleware.ts) ────

describe('parseApiError — error code translation', () => {
  it('translates a known code to its Arabic dictionary entry, taking priority over backendMsg', () => {
    const err = makeAxiosError(400, 'Email already in use', {}, undefined, 'EMAIL_ALREADY_EXISTS');
    const result = parseApiError(err);
    expect(result.message).toBe('البريد الإلكتروني مستخدم بالفعل');
    expect(result.code).toBe('EMAIL_ALREADY_EXISTS');
  });

  it('translates PHONE_ALREADY_EXISTS', () => {
    const err = makeAxiosError(400, 'Phone number already in use', {}, undefined, 'PHONE_ALREADY_EXISTS');
    expect(parseApiError(err).message).toBe('رقم الهاتف مستخدم بالفعل');
  });

  it('falls back to backendMsg when the code is unrecognised (400)', () => {
    const err = makeAxiosError(400, 'حقل مخصص غير معروف', {}, undefined, 'SOME_UNMAPPED_CODE');
    const result = parseApiError(err);
    expect(result.message).toBe('حقل مخصص غير معروف');
    expect(result.code).toBe('SOME_UNMAPPED_CODE');
  });

  it('exposes `code` even when it resolves via the status-code default fallback', () => {
    const err = makeAxiosError(404, 'Ad not found', {}, undefined, 'AD_NOT_FOUND');
    const result = parseApiError(err);
    expect(result.message).toBe('الإعلان غير موجود');
    expect(result.code).toBe('AD_NOT_FOUND');
  });

  it('interpolates meta.maxPerUser into the AD_LIMIT_REACHED message', () => {
    const err = makeAxiosError(
      400,
      'You have reached the maximum number of active ads (5).',
      {},
      undefined,
      'AD_LIMIT_REACHED',
      { maxPerUser: 5 },
    );
    const result = parseApiError(err);
    expect(result.message).toContain('5');
    expect(result.message).toContain('الحد الأقصى');
  });

  it('401 never leaks backendMsg even when the code is unrecognised', () => {
    const err = makeAxiosError(401, 'JWT malformed: unexpected token', {}, undefined, 'SOME_FUTURE_AUTH_CODE');
    const result = parseApiError(err);
    expect(result.message).toBe('انتهت جلستك، يرجى تسجيل الدخول مجدداً');
    expect(result.message).not.toContain('JWT');
  });

  it('401 uses the dictionary translation for a recognised auth code', () => {
    const err = makeAxiosError(401, 'Account is locked', {}, undefined, 'ACCOUNT_LOCKED');
    expect(parseApiError(err).message).toBe('تم قفل الحساب مؤقتاً بسبب محاولات دخول متكررة، حاول لاحقاً');
  });

  it('500 never leaks backendMsg even when the code is unrecognised', () => {
    const err = makeAxiosError(500, 'PostgreSQL connection refused', {}, undefined, 'SOME_FUTURE_500_CODE');
    const result = parseApiError(err);
    expect(result.message).toBe('خطأ في الخادم، يرجى المحاولة لاحقاً');
    expect(result.message).not.toContain('PostgreSQL');
  });

  it('code is undefined when the backend response has no code field', () => {
    const err = makeAxiosError(400, 'Some message');
    expect(parseApiError(err).code).toBeUndefined();
  });
});

// ── 429 Rate-limit header parsing ─────────────────────────────────

describe('parseApiError — 429 Retry-After', () => {
  it('parses retry-after header in seconds and converts to minutes (ceil)', () => {
    const err = makeAxiosError(429, undefined, { 'retry-after': '300' }); // 5 min
    const result = parseApiError(err);
    expect(result.statusCode).toBe(429);
    expect(result.message).toContain('5');
    expect(result.message).toContain('دقيقة');
  });

  it('ceils partial minutes (e.g. 90s → 2 min)', () => {
    const err = makeAxiosError(429, undefined, { 'retry-after': '90' });
    expect(parseApiError(err).message).toContain('2');
  });

  it('defaults to 15 minutes when no retry-after header', () => {
    const err = makeAxiosError(429);
    expect(parseApiError(err).message).toContain('15');
  });

  it('defaults to 15 minutes when retry-after is non-numeric', () => {
    const err = makeAxiosError(429, undefined, { 'retry-after': 'soon' });
    expect(parseApiError(err).message).toContain('15');
  });
});

// ── Network error ─────────────────────────────────────────────────

describe('parseApiError — network error (no response)', () => {
  it('returns Arabic connectivity message with statusCode 0', () => {
    const err = makeNetworkError();
    const result = parseApiError(err);
    expect(result.statusCode).toBe(0);
    expect(result.message).toBe('تعذّر الاتصال بالخادم، تحقق من اتصالك بالإنترنت');
  });
});

// ── Non-Axios Error ────────────────────────────────────────────────

describe('parseApiError — plain Error instances', () => {
  it('returns sanitised error.message with statusCode 0', () => {
    const result = parseApiError(new Error('something went wrong'));
    expect(result.statusCode).toBe(0);
    expect(result.message).toBe('something went wrong');
  });

  it('truncates plain Error message at 200 chars', () => {
    const longMsg = 'x'.repeat(300);
    const result = parseApiError(new Error(longMsg));
    expect(result.message.length).toBeLessThanOrEqual(200);
  });

  it('returns fallback for empty Error message', () => {
    const result = parseApiError(new Error(''));
    expect(result.message).toBe('حدث خطأ غير متوقع');
    expect(result.statusCode).toBe(0);
  });
});

// ── Unknown throw values ───────────────────────────────────────────

describe('parseApiError — non-Error, non-Axios throws', () => {
  it('handles string throw', () => {
    const result = parseApiError('something');
    expect(result.message).toBe('حدث خطأ غير متوقع');
    expect(result.statusCode).toBe(0);
  });

  it('handles null', () => {
    const result = parseApiError(null);
    expect(result.message).toBe('حدث خطأ غير متوقع');
    expect(result.statusCode).toBe(0);
  });

  it('handles plain object', () => {
    const result = parseApiError({ code: 'UNKNOWN' });
    expect(result.message).toBe('حدث خطأ غير متوقع');
    expect(result.statusCode).toBe(0);
  });

  it('handles undefined', () => {
    const result = parseApiError(undefined);
    expect(result.message).toBe('حدث خطأ غير متوقع');
    expect(result.statusCode).toBe(0);
  });
});

// ── sanitiseMsg: HTML stripping & truncation ──────────────────────

describe('parseApiError — message sanitisation', () => {
  it('strips HTML tags from backend message (400)', () => {
    const err = makeAxiosError(400, '<b>حقل مطلوب</b>');
    expect(parseApiError(err).message).toBe('حقل مطلوب');
  });

  it('strips nested HTML from backend 403 message', () => {
    const err = makeAxiosError(403, '<script>alert(1)</script>غير مصرح');
    expect(parseApiError(err).message).toBe('غير مصرح');
    expect(parseApiError(err).message).not.toContain('<script>');
  });

  it('truncates backend message at 200 characters', () => {
    const longMsg = 'أ'.repeat(300);
    const err = makeAxiosError(400, longMsg);
    expect(parseApiError(err).message.length).toBeLessThanOrEqual(200);
  });

  it('does NOT truncate 5xx even if backend sends long message (uses hardcoded string)', () => {
    const err = makeAxiosError(500, 'أ'.repeat(300));
    // 5xx always returns the short hardcoded message
    expect(parseApiError(err).message).toBe('خطأ في الخادم، يرجى المحاولة لاحقاً');
  });

  it('trims whitespace from backend message', () => {
    const err = makeAxiosError(400, '   بيانات خاطئة   ');
    expect(parseApiError(err).message).toBe('بيانات خاطئة');
  });
});

// ── Return type shape ─────────────────────────────────────────────

describe('parseApiError — return shape', () => {
  it('always returns { message: string, statusCode: number }', () => {
    const cases = [
      makeAxiosError(200),
      makeAxiosError(400),
      makeAxiosError(401),
      makeAxiosError(500),
      makeNetworkError(),
      new Error('x'),
      null,
    ];
    for (const c of cases) {
      const r = parseApiError(c);
      expect(typeof r.message).toBe('string');
      expect(typeof r.statusCode).toBe('number');
    }
  });

  it('message is never empty string', () => {
    const cases = [makeAxiosError(400), makeNetworkError(), new Error(''), null];
    for (const c of cases) {
      expect(parseApiError(c).message.length).toBeGreaterThan(0);
    }
  });
});

// ── FIX M-1: field-level validation errors ────────────────────────
//
// Before this fix, error.middleware.ts's `errors: Record<string, string[]>`
// object (built for every ZodError) was never read anywhere on the
// frontend — every validation failure surfaced as the same generic
// message regardless of which field(s) actually failed.

describe('parseApiError — fieldErrors (FIX M-1)', () => {
  it('extracts fieldErrors from a 400 with a body.* validation errors object', () => {
    const err = makeAxiosError(400, 'Validation failed', {}, {
      'body.title':       ['Title must be at least 3 characters'],
      'body.description': ['Description must be at least 10 characters'],
    });
    const result = parseApiError(err);
    expect(result.fieldErrors).toEqual({
      title:       ['Title must be at least 3 characters'],
      description: ['Description must be at least 10 characters'],
    });
  });

  it('strips the query.* wrapper prefix the same way as body.*', () => {
    const err = makeAxiosError(400, 'Validation failed', {}, {
      'query.sortBy': ["Invalid enum value. Expected 'createdAt' | 'price' | 'views'"],
    });
    const result = parseApiError(err);
    expect(result.fieldErrors).toEqual({
      sortBy: ["Invalid enum value. Expected 'createdAt' | 'price' | 'views'"],
    });
  });

  it('strips the params.* wrapper prefix the same way', () => {
    const err = makeAxiosError(400, 'Validation failed', {}, {
      'params.id': ['Ad ID is required'],
    });
    const result = parseApiError(err);
    expect(result.fieldErrors).toEqual({ id: ['Ad ID is required'] });
  });

  it('leaves a bare "general" key untouched (matches error.middleware.ts fallback for an empty Zod path)', () => {
    const err = makeAxiosError(400, 'Validation failed', {}, {
      general: ['Something about the whole request was invalid'],
    });
    const result = parseApiError(err);
    expect(result.fieldErrors).toEqual({
      general: ['Something about the whole request was invalid'],
    });
  });

  it('preserves multiple messages for the same field, in order', () => {
    const err = makeAxiosError(400, 'Validation failed', {}, {
      'body.price': ['Price must be a positive number', 'Price cannot have more than 2 decimal places'],
    });
    const result = parseApiError(err);
    expect(result.fieldErrors?.price).toEqual([
      'Price must be a positive number',
      'Price cannot have more than 2 decimal places',
    ]);
  });

  it('sanitises (HTML-strips) individual field error messages the same way as the top-level message', () => {
    const err = makeAxiosError(400, 'Validation failed', {}, {
      'body.title': ['<script>alert(1)</script>Title is required'],
    });
    const result = parseApiError(err);
    expect(result.fieldErrors?.title?.[0]).toBe('Title is required');
    expect(result.fieldErrors?.title?.[0]).not.toContain('<script>');
  });

  it('is undefined (not an empty object) when the backend sends no errors field', () => {
    const err = makeAxiosError(400, 'Some other 400');
    expect(parseApiError(err).fieldErrors).toBeUndefined();
  });

  it('is never populated for non-400 statuses, even if the body happens to have an errors-shaped field', () => {
    // Defends against a coincidental `errors` key on a 403/404/500 body
    // being misread as field-level validation detail it isn't.
    const err = makeAxiosError(403, 'Forbidden', {}, { 'body.title': ['nope'] });
    expect(parseApiError(err).fieldErrors).toBeUndefined();
  });

  it('ignores non-array values under a key rather than throwing', () => {
    const err = makeAxiosError(400, 'Validation failed', {}, {
      // @ts-expect-error — deliberately malformed shape to test defensive parsing
      'body.title': 'not an array',
    });
    expect(() => parseApiError(err)).not.toThrow();
    expect(parseApiError(err).fieldErrors).toBeUndefined();
  });
});

describe('parseApiError idempotency (FIX AUTH-MSG-01)', () => {
  // Regression coverage for the "double-parse" bug: apiClient's response
  // interceptor (client.ts) already calls parseApiError before rejecting,
  // so every rejection reaching a mutation's onError/a form's error prop is
  // already a ParsedError. Feeding that ParsedError into parseApiError a
  // second time must return it unchanged — not fall through to the generic
  // "حدث خطأ غير متوقع" fallback, which is what happened before this fix
  // (a ParsedError is neither an AxiosError nor an `instanceof Error`).

  it('returns an already-parsed 401 unchanged instead of the generic fallback', () => {
    const firstPass = parseApiError(makeAxiosError(401, 'ignored', {}, undefined, 'INVALID_CREDENTIALS'));
    const secondPass = parseApiError(firstPass);
    expect(secondPass).toEqual(firstPass);
    expect(secondPass.message).not.toBe('حدث خطأ غير متوقع');
    expect(secondPass.message).toBe('البريد الإلكتروني أو كلمة المرور غير صحيحة');
  });

  it('preserves code and fieldErrors through a second parse (RegisterForm flow)', () => {
    const firstPass = parseApiError(
      makeAxiosError(400, 'Email already in use', {}, undefined, 'EMAIL_ALREADY_EXISTS'),
    );
    const secondPass = parseApiError(firstPass);
    expect(secondPass.code).toBe('EMAIL_ALREADY_EXISTS');
    expect(secondPass.message).toBe(firstPass.message);
  });

  it('preserves a 429 rate-limit message through a second parse', () => {
    const firstPass = parseApiError(makeAxiosError(429, 'ignored', { 'retry-after': '120' }));
    const secondPass = parseApiError(firstPass);
    expect(secondPass.message).toBe(firstPass.message);
    expect(secondPass.statusCode).toBe(429);
  });

  it('still parses a raw AxiosError normally (does not treat every object as pre-parsed)', () => {
    const err = makeAxiosError(500, 'db exploded');
    const parsed = parseApiError(err);
    expect(parsed.message).toBe('خطأ في الخادم، يرجى المحاولة لاحقاً');
    expect(parsed.statusCode).toBe(500);
  });

  it('still falls through to the generic message for a truly unknown value', () => {
    expect(parseApiError({ foo: 'bar' }).message).toBe('حدث خطأ غير متوقع');
    expect(parseApiError(null).message).toBe('حدث خطأ غير متوقع');
  });
});

describe('getFieldError', () => {
  it('returns the first message for a field that has errors', () => {
    const err = makeAxiosError(400, 'Validation failed', {}, {
      'body.city': ['City is required', 'City must be a known city'],
    });
    const parsed = parseApiError(err);
    expect(getFieldError(parsed, 'city')).toBe('City is required');
  });

  it('returns undefined for a field with no errors', () => {
    const err = makeAxiosError(400, 'Validation failed', {}, {
      'body.city': ['City is required'],
    });
    const parsed = parseApiError(err);
    expect(getFieldError(parsed, 'title')).toBeUndefined();
  });

  it('returns undefined when the parsed error itself is undefined (e.g. mutation has not errored yet)', () => {
    expect(getFieldError(undefined, 'title')).toBeUndefined();
  });

  it('returns undefined when there are no fieldErrors at all', () => {
    const parsed = parseApiError(makeAxiosError(500, 'boom'));
    expect(getFieldError(parsed, 'title')).toBeUndefined();
  });
});
