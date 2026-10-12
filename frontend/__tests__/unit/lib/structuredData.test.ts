import { describe, expect, it } from 'vitest';
import { safeJsonLd } from '@/lib/structuredData';

describe('safeJsonLd', () => {
  it('escapes HTML-significant characters before embedding JSON in a script element', () => {
    const serialized = safeJsonLd({
      name: '</script><script>alert(1)</script>',
      description: 'A > B & C',
    });

    expect(serialized).not.toContain('</script>');
    expect(serialized).not.toContain('<script>');
    expect(serialized).toContain('\\u003c/script\\u003e');
    expect(serialized).toContain('\\u003e');
    expect(serialized).toContain('\\u0026');
  });

  it('preserves the original data when the escaped JSON is parsed', () => {
    const input = {
      name: '</script> & "quoted"',
      nested: { value: '<tag> & more' },
      count: 3,
    };

    expect(JSON.parse(safeJsonLd(input))).toEqual(input);
  });

  it('escapes all occurrences, not only the first one', () => {
    const serialized = safeJsonLd({ value: '<one> & <two>' });

    expect(serialized.match(/\\u003c/g)).toHaveLength(2);
    expect(serialized.match(/\\u003e/g)).toHaveLength(2);
    expect(serialized.match(/\\u0026/g)).toHaveLength(1);
  });
});
