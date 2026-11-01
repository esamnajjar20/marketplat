import { describe, expect, it } from 'vitest';
import { resolvePageState } from '../pagination';

describe('resolvePageState', () => {
  it('prefers explicit server pagination fields', () => {
    expect(resolvePageState({ page: 2, totalPages: 5, hasNextPage: false }, 3, 20, 20))
      .toEqual({ page: 2, totalPages: 5, hasNextPage: false });
  });
  it('derives total pages from total when totalPages is absent', () => {
    expect(resolvePageState({ page: 2, total: 41 }, 2, 20, 20))
      .toEqual({ page: 2, totalPages: 3, hasNextPage: true });
  });
  it('does not stop pagination merely because totalPages is omitted on a full page', () => {
    expect(resolvePageState(undefined, 1, 20, 20))
      .toEqual({ page: 1, totalPages: 2, hasNextPage: true });
  });
  it('stops when an unannotated response is shorter than the requested page size', () => {
    expect(resolvePageState(undefined, 2, 7, 20))
      .toEqual({ page: 2, totalPages: 2, hasNextPage: false });
  });
});
