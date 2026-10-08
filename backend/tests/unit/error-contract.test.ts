import { ErrorCode } from '../../src/shared/errors/errorCodes';
import { buildApiErrorBody } from '../../src/shared/errors/errorResponse';

function makeRequest(requestId = '11111111-1111-4111-8111-111111111111') {
  return { requestId } as never;
}

describe('unified API error contract', () => {
  it('keeps every backend error code unique and machine-readable', () => {
    const values = Object.values(ErrorCode);
    expect(values.length).toBe(new Set(values).size);
    expect(values.every((value) => /^[A-Z][A-Z0-9_]+$/.test(value))).toBe(true);
  });

  it('builds the complete response envelope from one helper', () => {
    const body = buildApiErrorBody(
      makeRequest(),
      409,
      ErrorCode.CONFLICT,
      'Conflict',
      { resource: 'store' },
    );

    expect(body).toEqual({
      success: false,
      message: 'Conflict',
      statusCode: 409,
      code: ErrorCode.CONFLICT,
      requestId: '11111111-1111-4111-8111-111111111111',
      meta: { resource: 'store' },
    });
  });
});
