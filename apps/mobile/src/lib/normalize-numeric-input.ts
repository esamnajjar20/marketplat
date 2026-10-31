/** Normalize Arabic/Persian digits and decimal separators into an ASCII form. */
export function normalizeNumericInput(value: string): string {
  return value
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (digit) => String(digit.charCodeAt(0) - 0x06f0))
    .replace(/[٫،,]/g, '.')
    .replace(/٬/g, '')
    .replace(/[\s\u00a0\u200e\u200f]/g, '');
}
