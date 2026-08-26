import { runBulk } from '../../src/shared/utils/bulkRunner';
import { NotFoundError } from '../../src/shared/errors/NotFoundError';

describe('runBulk', () => {
  it('collects successes and failures independently', async () => {
    const action = jest.fn(async (id: string) => {
      if (id === 'bad') throw new NotFoundError('missing');
      if (id === 'boom') throw 'string-error';
      return { id };
    });

    const result = await runBulk(['a', 'bad', 'b', 'boom'], action);

    expect(result.updated).toEqual([{ id: 'a' }, { id: 'b' }]);
    expect(result.failed).toEqual([
      { id: 'bad', reason: 'missing' },
      { id: 'boom', reason: 'Update failed' },
    ]);
  });

  it('returns empty arrays for empty input', async () => {
    const result = await runBulk([], async () => ({}));
    expect(result).toEqual({ updated: [], failed: [] });
  });
});
