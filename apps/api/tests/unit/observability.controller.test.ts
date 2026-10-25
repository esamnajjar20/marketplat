import {
  sanitizeClientErrorContext,
  sanitizeClientUrl,
  sanitizeDiagnosticText,
} from '../../src/modules/observability/observability.controller';

describe('sanitizeClientErrorContext', () => {
  it('redacts credentials at every nested object level', () => {
    expect(sanitizeClientErrorContext({
      route: '/checkout',
      authorization: 'Bearer secret',
      nested: { refreshToken: 'refresh-secret', count: 2 },
    })).toEqual({
      route: '/checkout',
      authorization: '[redacted]',
      nested: { refreshToken: '[redacted]', count: 2 },
    });
  });

  it('bounds arrays, object entries, strings, and recursion depth', () => {
    const deep = { a: { b: { c: { d: { e: { f: 'value' } } } } } };
    const result = sanitizeClientErrorContext({
      long: 'x'.repeat(3_000),
      items: Array.from({ length: 60 }, (_, i) => i),
      ...deep,
    }) as Record<string, any>;

    expect(result.long).toHaveLength(2_000);
    expect(result.items).toHaveLength(50);
    expect(result.a.b.c.d.e).toBe('[truncated]');
  });
});

describe('client error diagnostic sanitization', () => {
  it('removes URL query/hash and embedded URL credentials', () => {
    expect(sanitizeClientUrl('https://user:pass@example.test/path?token=secret#fragment'))
      .toBe('https://example.test/path');
  });

  it('redacts bearer tokens and sensitive query parameters in message/stack text', () => {
    expect(sanitizeDiagnosticText('Bearer abc.def token=secret&password=pw', 200))
      .toBe('Bearer [redacted] token=[redacted]&password=[redacted]');
  });
});
