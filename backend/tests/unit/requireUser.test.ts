import { requireUser } from '../../src/shared/utils/requireUser';
import { UnauthorizedError } from '../../src/shared/errors/UnauthorizedError';
import { Request } from 'express';

describe('requireUser', () => {
  it('returns user when present', () => {
    const req = { user: { userId: 'u1', sessionId: 's1', role: 'USER' } } as Request;
    expect(requireUser(req).userId).toBe('u1');
  });

  it('throws when user is missing', () => {
    const req = {} as Request;
    expect(() => requireUser(req)).toThrow(UnauthorizedError);
    expect(() => requireUser(req)).toThrow('Authentication required');
  });
});
