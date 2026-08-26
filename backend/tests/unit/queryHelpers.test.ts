import { z } from 'zod';
import { optionalQueryNumber } from '../../src/shared/utils/queryHelpers';

describe('optionalQueryNumber', () => {
  const schema = optionalQueryNumber(z.number().int().min(1).max(100));

  it('passes through undefined', () => {
    expect(schema.parse(undefined)).toBeUndefined();
  });

  it('coerces numeric strings', () => {
    expect(schema.parse('12')).toBe(12);
  });

  it('rejects out of range values', () => {
    expect(() => schema.parse('0')).toThrow();
    expect(() => schema.parse('101')).toThrow();
  });
});
