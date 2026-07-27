import { Request } from 'express';
import { getClientIp } from '../../src/shared/utils/getClientIp';

function makeRequest(ip: string | undefined): Request {
  return { ip } as unknown as Request;
}

describe('getClientIp', () => {
  it('returns req.ip when set', () => {
    expect(getClientIp(makeRequest('203.0.113.5'))).toBe('203.0.113.5');
  });

  it('returns "unknown" when req.ip is undefined', () => {
    expect(getClientIp(makeRequest(undefined))).toBe('unknown');
  });

  it('returns "unknown" when req.ip is an empty string', () => {
    // Express never actually sets req.ip to '', but defend against it anyway —
    // an empty string is falsy and should fall back to the same default.
    expect(getClientIp(makeRequest(''))).toBe('unknown');
  });

  it('does not attempt to parse x-forwarded-for itself', () => {
    // FIX SEC-09: this function intentionally does NOT read headers directly —
    // req.ip is already computed by Express's trust-proxy setting, which is
    // the single source of truth for how many proxy hops to trust. Confirm
    // that a request with a spoofable header but no req.ip still falls back
    // to 'unknown' rather than trusting the raw header.
    const req = {
      ip: undefined,
      headers: { 'x-forwarded-for': '1.2.3.4' },
    } as unknown as Request;
    expect(getClientIp(req)).toBe('unknown');
  });

  it('returns an IPv6 address unchanged', () => {
    expect(getClientIp(makeRequest('::1'))).toBe('::1');
  });
});
