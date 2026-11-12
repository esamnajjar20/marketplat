/** Narrow an unknown JSON value to a plain object, or null (arrays are rejected). */
export function asPlainObject(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}
