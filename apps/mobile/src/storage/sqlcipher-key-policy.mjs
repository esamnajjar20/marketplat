/** SQLCipher raw key material must be exactly 32 bytes represented as 64 hex chars. */
export function isValidSqlCipherKey(value) {
  return typeof value === 'string' && /^[a-f0-9]{64}$/i.test(value);
}
