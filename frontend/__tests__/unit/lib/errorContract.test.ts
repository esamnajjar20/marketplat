import { ErrorCode, FrontendOnlyErrorCode } from '@/lib/errorCodes';
import { errorMessages, getErrorMessage } from '@/lib/i18n/ar/errors';

describe('unified frontend error contract', () => {
  it('has an Arabic presentation for every backend error code', () => {
    for (const code of Object.values(ErrorCode)) {
      expect(getErrorMessage(code)).toBeTruthy();
    }
  });

  it('also covers service-worker-only error codes', () => {
    for (const code of Object.values(FrontendOnlyErrorCode)) {
      expect(getErrorMessage(code)).toBeTruthy();
    }
  });

  it('does not expose an English backend fallback for known codes', () => {
    expect(errorMessages[ErrorCode.INTERNAL_ERROR]).toBe('خطأ في الخادم، يرجى المحاولة لاحقاً');
    expect(errorMessages[ErrorCode.RATE_LIMIT_EXCEEDED]).toContain('طلبات كثيرة');
  });
});
