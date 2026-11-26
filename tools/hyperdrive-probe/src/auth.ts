const encoder = new TextEncoder();
const MIN_TOKEN_LENGTH = 32;
const MAX_TOKEN_LENGTH = 512;

/** Accept only a single Bearer credential from the Authorization header. */
export function extractBearerToken(request: Request): string | null {
  const authorization = request.headers.get('authorization');
  if (!authorization) return null;

  const match = /^Bearer ([^\s,]+)$/i.exec(authorization.trim());
  return match?.[1] ?? null;
}

/**
 * Compare credentials without an early byte-by-byte exit.
 * Hashing first makes the comparison length fixed; credentials are also bounded
 * to prevent an unauthenticated caller from forcing unbounded hashing work.
 */
export async function constantTimeTokenEquals(
  supplied: string | null,
  expected: string | undefined,
): Promise<boolean> {
  if (
    !supplied ||
    !expected ||
    supplied.length < MIN_TOKEN_LENGTH ||
    expected.length < MIN_TOKEN_LENGTH ||
    supplied.length > MAX_TOKEN_LENGTH ||
    expected.length > MAX_TOKEN_LENGTH
  ) {
    return false;
  }

  const [suppliedDigest, expectedDigest] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(supplied)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);

  const left = new Uint8Array(suppliedDigest);
  const right = new Uint8Array(expectedDigest);
  let difference = 0;

  for (let index = 0; index < left.length; index += 1) {
    difference |= left[index]! ^ right[index]!;
  }

  return difference === 0;
}
