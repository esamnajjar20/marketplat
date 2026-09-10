/**
 * __tests__/unit/lib/serviceQuoteStatus.test.ts
 */
import { describe, it, expect } from 'vitest';
import {
  SERVICE_QUOTE_STATUS_LABELS,
  SERVICE_QUOTE_STATUS_VARIANT,
} from '@/lib/serviceQuoteStatus';

describe('serviceQuoteStatus', () => {
  it('maps every status to an Arabic label', () => {
    expect(SERVICE_QUOTE_STATUS_LABELS.PENDING).toBe('قيد الانتظار');
    expect(SERVICE_QUOTE_STATUS_LABELS.ACCEPTED).toBe('مقبول');
    expect(SERVICE_QUOTE_STATUS_LABELS.DECLINED).toBe('مرفوض');
    expect(SERVICE_QUOTE_STATUS_LABELS.WITHDRAWN).toBe('مسحوب');
  });

  it('maps every status to a badge variant', () => {
    expect(SERVICE_QUOTE_STATUS_VARIANT.PENDING).toBe('warning');
    expect(SERVICE_QUOTE_STATUS_VARIANT.ACCEPTED).toBe('success');
    expect(SERVICE_QUOTE_STATUS_VARIANT.DECLINED).toBe('destructive');
    expect(SERVICE_QUOTE_STATUS_VARIANT.WITHDRAWN).toBe('outline');
  });
});
