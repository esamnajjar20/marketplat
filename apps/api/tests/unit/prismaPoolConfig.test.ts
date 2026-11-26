import { buildPrismaDatabaseUrl } from '../../src/shared/db/prismaPoolConfig';

describe('buildPrismaDatabaseUrl', () => {
  it('sets an explicit Prisma pool size and timeout while preserving unrelated params', () => {
    const result = new URL(
      buildPrismaDatabaseUrl(
        'postgresql://user:pass@localhost:5432/marketplat?sslmode=require&connection_limit=20',
        1,
        15
      )
    );

    expect(result.searchParams.get('connection_limit')).toBe('1');
    expect(result.searchParams.get('pool_timeout')).toBe('15');
    expect(result.searchParams.get('sslmode')).toBe('require');
  });

  it('rejects non-PostgreSQL URLs', () => {
    expect(() => buildPrismaDatabaseUrl('https://example.com', 1, 15)).toThrow(/PostgreSQL/);
  });

  it('rejects unsafe pool limits', () => {
    expect(() => buildPrismaDatabaseUrl('postgresql://user:pass@localhost/db', 0, 15)).toThrow(/DB_CONNECTION_LIMIT/);
    expect(() => buildPrismaDatabaseUrl('postgresql://user:pass@localhost/db', 1, 0)).toThrow(/DB_POOL_TIMEOUT_SECONDS/);
  });
});
